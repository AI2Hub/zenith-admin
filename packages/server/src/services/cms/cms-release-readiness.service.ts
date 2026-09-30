import { and, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { CMS_RELEASE_CHECK_RULE_VERSION, uniqueCmsReleaseChecks, resolveEffectivelyEnabledChannelIds, inspectCmsReleaseConfiguration, inspectCmsReleaseTaxonomy, makeCmsReleaseCheck, mergeCmsConfigurationSnapshots, validateCmsStructuredFields, collectCmsReleaseModelValues, type CmsConfigurationSnapshot, type CmsContentRevisionSnapshot, type CmsModelField, type CmsReleaseCheck, type CmsReleaseDependencyOption } from '@zenith/shared/cms';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { cmsAssetRights, cmsAssetVersions, cmsContentRevisionApprovals, cmsContentWorkingCopies, cmsContentSuppressions, cmsModels, cmsModelVersions, cmsModelUniqueValues, type CmsReleaseRow } from '../../db/schema';
import { formatDateTime, parseDateTimeInput } from '../../lib/datetime';
import { cmsGenerationSchemaName, readCmsGenerationConfigurationRows } from './cms-generation-storage.service';
import { assertCmsDeploymentStorageAvailable } from './cms-deployment-storage-state';
import { cmsReleaseInputFingerprint } from './cms-release-fingerprint';
import { loadCmsRevision, loadCmsPublishableRevision } from './cms-content-revisions.service';
import { cmsSnapshotHash } from './cms-design-versions.service';
import { requireCmsContentsAccess } from './cms-content-access.service';
import { assertChannelAccess } from './cms-channels.service';
import { isCmsRevisionAssetVisible } from './cms-asset-rights.service';

const GRAPH_COLUMNS = {
  cms_sites: 'id,code',
  cms_channels: 'id,name,code,path,parent_id,status,type,detail_path_rule',
  cms_pages: 'id,name,status,blocks,path,slug,is_home',
  cms_widgets: 'id,name,status,published_name,published_data',
  cms_widget_refs: 'id,owner_type,owner_id,field,widget_id',
  cms_tags: 'id,slug,vocabulary_id',
  cms_vocabularies: 'id,name,model_ids,required,max_selections,status',
  cms_content_collections: 'id,name,site_id',
} as const;

/** Reconstruct only the small graph projection. Working pages/widgets never enter an unselected release. */
async function candidateConfiguration(executor: DbExecutor, release: CmsReleaseRow): Promise<CmsConfigurationSnapshot> {
  if (release.baseGenerationId) await assertCmsDeploymentStorageAvailable(executor, release.baseGenerationId);
  const previous: CmsConfigurationSnapshot = { tables: {}, replaceAll: [] };
  for (const [table, columns] of Object.entries(GRAPH_COLUMNS)) {
    if (release.baseGenerationId) {
      previous.tables[table] = (await readCmsGenerationConfigurationRows(executor, release.baseGenerationId, table as keyof typeof GRAPH_COLUMNS, columns.split(','))).filter(row => table !== 'cms_sites' || Number(row.id) === release.siteId);
      continue;
    }
    if (!release.baseGenerationId && ['cms_pages', 'cms_widgets', 'cms_widget_refs', 'cms_content_collections'].includes(table)) { previous.tables[table] = []; continue; }
    const key = table === 'cms_sites' ? 'id' : 'site_id';
    const rows = await executor.execute<{ row: Record<string, unknown> }>(sql`SELECT to_jsonb(candidate) AS row FROM (SELECT ${sql.raw(columns)} FROM public.${sql.identifier(table)} WHERE ${sql.identifier(key)}=${release.siteId}) candidate`);
    previous.tables[table] = rows.map(entry => entry.row);
  }
  return mergeCmsConfigurationSnapshots(previous, release.configurationSnapshot);
}

type ModelReference = { id: number; fieldPath: string; fieldLabel: string; modelIds?: readonly number[] };
async function assetChecks(executor: DbExecutor, siteId: number, object: CmsReleaseCheck['object'], pins: Record<string, number>, at: Date): Promise<CmsReleaseCheck[]> {
  const ids = Object.keys(pins).map(Number);
  if (!ids.length) return [];
  const [versions, rights] = await Promise.all([
    executor.select({ id: cmsAssetVersions.id, resourceId: cmsAssetVersions.resourceId, siteId: cmsAssetVersions.siteId }).from(cmsAssetVersions).where(inArray(cmsAssetVersions.id, Object.values(pins))),
    executor.select().from(cmsAssetRights).where(inArray(cmsAssetRights.resourceId, ids)),
  ]);
  return ids.flatMap(id => {
    const version = versions.find(row => row.id === pins[String(id)] && row.resourceId === id && row.siteId === siteId);
    const license = rights.find(row => row.resourceId === id);
    const message = !version ? `素材 #${id} 的固定文件版本不存在或不属于本站` : license?.revoked ? `素材 #${id} 已撤权` : license?.expiresAt && license.expiresAt <= at ? `素材 #${id} 的授权已到期或将在本次排期前到期` : null;
    return message ? [makeCmsReleaseCheck({ siteId, object, code: 'asset-rights', reference: { kind: 'resource', id }, fieldPath: `assetVersions.${id}`, fieldLabel: '固定素材版本与授权', message })] : [];
  });
}

/** ACL helpers use the request database; call only after the readiness snapshot transaction completes. */
export async function suggestCmsReleaseDependencies(release: CmsReleaseRow, checks: readonly CmsReleaseCheck[]): Promise<CmsReleaseDependencyOption[]> {
  const ids = [...new Set(checks.filter(check => check.recommendedAction === 'select-approved' && check.reference?.kind === 'content').map(check => check.reference!.id))];
  const options: CmsReleaseDependencyOption[] = [];
  for (const id of ids) {
    if (release.items.some(item => item.contentId === id)) continue;
    try {
      const [identity] = await requireCmsContentsAccess([id]);
      if (identity.siteId !== release.siteId) continue;
      const [working] = await db.select({ approved: cmsContentWorkingCopies.approvedRevisionId, published: cmsContentWorkingCopies.publishedRevisionId }).from(cmsContentWorkingCopies).where(eq(cmsContentWorkingCopies.contentId, id)).limit(1);
      for (const revisionId of new Set([working?.approved, working?.published])) {
        if (!revisionId) continue;
        const revision = await loadCmsPublishableRevision(db, revisionId);
        await assertChannelAccess(revision.snapshot.channelId);
        if (!await isCmsRevisionAssetVisible(revision.snapshot, db)) continue;
        options.push({ contentId: id, revisionId, revisionVersion: revision.version, title: revision.title, hash: revision.hash });
      }
    } catch (error) {
      if (!(error instanceof HTTPException) || ![400, 403, 404, 409].includes(error.status)) throw error;
      // Dependency identities can exist in authored references without granting access to their drafts.
    }
  }
  return options;
}

/** Read-only readiness for exactly this release's fixed versions. Runtime rights and reservations are always rechecked. */
export async function inspectCmsReleaseReadiness(executor: DbExecutor, release: CmsReleaseRow) {
  const siteId = release.siteId, checks: CmsReleaseCheck[] = [], at = release.activateAt && release.activateAt > new Date() ? release.activateAt : new Date();
  const revisions: { contentId: number; revisionId: number; snapshot: CmsContentRevisionSnapshot; object: CmsReleaseCheck['object']; fields: CmsModelField[]; references: ModelReference[] }[] = [];
  for (const item of release.items) {
    if (!item.revisionId) continue;
    const object = { kind: 'content' as const, id: item.contentId, title: item.title, revisionId: item.revisionId };
    try {
      const revision = await loadCmsRevision(executor, item.revisionId);
      if (revision.contentId !== item.contentId || revision.siteId !== siteId) throw new HTTPException(409, { message: '固定修订与发布对象或站点不匹配' });
      const [approval] = await executor.select({ hash: cmsContentRevisionApprovals.hash }).from(cmsContentRevisionApprovals).where(eq(cmsContentRevisionApprovals.revisionId, item.revisionId)).limit(1);
      if (!approval || approval.hash !== revision.hash) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'approval', recommendedAction: 'review', message: '固定修订尚未批准或批准摘要不匹配' }));
      if (revision.payload.deletedAt || revision.payload.archivedAt || revision.payload.lockedAt) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'content-state', message: '内容已回收、归档或锁定，不能发布' }));
      const snapshot = revision.snapshot;
      let fields: CmsModelField[] = [];
      if (snapshot.modelId) {
        try {
          if (!snapshot.modelVersionId) throw new HTTPException(409, { message: '固定修订缺少模型版本，请重新审核内容' });
          const [version] = await executor.select({ fields: cmsModelVersions.fields, ownerSiteId: cmsModels.ownerSiteId }).from(cmsModelVersions).innerJoin(cmsModels, eq(cmsModels.id, cmsModelVersions.modelId)).where(and(eq(cmsModelVersions.id, snapshot.modelVersionId), eq(cmsModelVersions.modelId, snapshot.modelId))).limit(1);
          if (!version || (version.ownerSiteId !== null && version.ownerSiteId !== siteId)) throw new HTTPException(409, { message: '固定模型版本不存在或不属于本站' });
          // Published definitions already freeze dictionary options and component versions.
          fields = version.fields;
          for (const issue of validateCmsStructuredFields(fields, snapshot.extend ?? {}, true)) {
            const field = fields.find(row => issue.fieldPath === `extend.${row.name}` || issue.fieldPath.startsWith(`extend.${row.name}.`));
            checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: issue.rule, fieldPath: issue.fieldPath, fieldLabel: field?.label ?? '扩展字段', message: issue.message, severity: issue.severity }));
          }
        } catch (error) {
          if (!(error instanceof HTTPException)) throw error;
          checks.push(makeCmsReleaseCheck({ siteId, object, code: 'model-version', fieldPath: 'modelVersionId', message: error.message }));
        }
      }
      if (!snapshot.title.trim() || snapshot.title === '未命名内容') checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'title', fieldPath: 'title', message: '请填写正式标题' }));
      for (const [fieldPath, code, message] of [['summary', 'summary', '建议填写摘要，便于检索和分享'], ['coverImage', 'cover', '尚未选择封面'], ['seoTitle', 'seo', '未设置独立 SEO 标题，将使用内容标题']] as const) {
        if (!snapshot[fieldPath]?.trim()) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code, fieldPath, message, severity: 'warning' }));
      }
      const expiry = parseDateTimeInput(snapshot.expireAt);
      if (expiry && expiry <= at) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'content-expiry', fieldPath: 'expireAt', fieldLabel: '到期时间', message: '内容在本次上线时已过期' }));
      checks.push(...await assetChecks(executor, siteId, object, snapshot.assetVersions, at));
      revisions.push({ contentId: item.contentId, revisionId: item.revisionId, snapshot, object, fields, references: [...collectCmsReleaseModelValues(fields, snapshot.extend).references, ...snapshot.relatedIds.map(id => ({ id, fieldPath: 'relatedIds', fieldLabel: '关联内容' }))] });
    } catch (error) {
      if (!(error instanceof HTTPException)) throw error;
      checks.push(makeCmsReleaseCheck({ siteId, object, code: 'revision', message: error.message }));
    }
  }
  checks.push(...await assetChecks(executor, siteId, { kind: 'site', id: siteId, title: '固定站点配置', revisionId: null }, release.configurationSnapshot.assetVersions ?? {}, at));
  const uniqueClaims = revisions.flatMap(revision => collectCmsReleaseModelValues(revision.fields, revision.snapshot.extend).uniqueValues.map(claim => ({
    ...claim, revision, modelId: revision.snapshot.modelId!, hash: cmsSnapshotHash(claim.value),
  })));
  const reservations = uniqueClaims.length ? await executor.select().from(cmsModelUniqueValues).where(and(eq(cmsModelUniqueValues.siteId, siteId), inArray(cmsModelUniqueValues.modelId, [...new Set(uniqueClaims.map(claim => claim.modelId))]))) : [];
  for (const claim of uniqueClaims) {
    const pending = uniqueClaims.find(other => other !== claim && other.modelId === claim.modelId && other.key === claim.key && other.hash === claim.hash);
    const occupied = reservations.some(other => other.contentId !== claim.revision.contentId && other.modelId === claim.modelId && other.field === claim.key && other.valueHash === claim.hash);
    if (pending || occupied) checks.push(makeCmsReleaseCheck({ siteId, object: claim.revision.object, kind: 'unique', code: 'model-unique', fieldPath: claim.fieldPath, fieldLabel: claim.fieldLabel, reference: pending ? { kind: 'content', id: pending.revision.contentId } : null, message: pending ? '本发布单内多个内容或组件使用了相同的模型唯一值' : '模型唯一字段值已被其他内容占用；请调整后重新审核并准备发布单' }));
  }
  try {
    const configuration = await candidateConfiguration(executor, release);
    const channels = (configuration.tables.cms_channels ?? []).map(row => ({ id: Number(row.id), parentId: Number(row.parent_id ?? 0), status: row.status as 'enabled' | 'disabled' }));
    const enabledChannelIds = resolveEffectivelyEnabledChannelIds(channels);
    const refs = [...new Set([...revisions.flatMap(row => row.references.map(ref => ref.id)), ...[...JSON.stringify(configuration.tables).matchAll(/entity:content\/(\d+)/g)].map(match => Number(match[1])),
      ...(configuration.tables.cms_widgets ?? []).flatMap(widget => ((widget.published_data as { items?: { sourceType: string; sourceId?: number }[] } | null)?.items ?? []).filter(item => item.sourceType === 'content').flatMap(item => item.sourceId ? [item.sourceId] : [])), ...revisions.map(row => row.contentId)])];
    const namespace = release.baseGenerationId ? cmsGenerationSchemaName(release.baseGenerationId) : 'public';
    const rows = refs.length ? await executor.execute<{ id: number; channelId: number; modelId: number | null; status: string; deletedAt: string | null; archivedAt: string | null; expireAt: string | null }>(sql`SELECT id,channel_id AS "channelId",model_id AS "modelId",status,deleted_at AS "deletedAt",archived_at AS "archivedAt",expire_at AS "expireAt" FROM ${sql.identifier(namespace)}.cms_contents WHERE site_id=${siteId} AND id IN (${sql.join(refs.map(id => sql`${id}`), sql`,`)})`) : [];
    const byId = new Map(rows.map(row => [row.id, row]));
    for (const revision of revisions) byId.set(revision.contentId, { id: revision.contentId, channelId: revision.snapshot.channelId, modelId: revision.snapshot.modelId, status: 'published', deletedAt: null, archivedAt: null, expireAt: revision.snapshot.expireAt ?? null });
    for (const item of release.items) if (item.action === 'withdraw') byId.delete(item.contentId);
    const suppressed = refs.length ? await executor.select({ id: cmsContentSuppressions.contentId }).from(cmsContentSuppressions).where(inArray(cmsContentSuppressions.contentId, refs)) : [];
    const suppressedIds = new Set(suppressed.map(row => row.id));
    const visibleContentIds = new Set([...byId.values()].filter(row => row.status === 'published' && !row.deletedAt && !row.archivedAt && !suppressedIds.has(row.id) && (!row.expireAt || (parseDateTimeInput(row.expireAt)?.getTime() ?? 0) > at.getTime()) && enabledChannelIds.has(row.channelId)).map(row => row.id));
    for (const revision of revisions) {
      checks.push(...inspectCmsReleaseTaxonomy(siteId, revision.object, configuration, revision.snapshot.modelId, revision.snapshot.tagIds));
      if (!enabledChannelIds.has(revision.snapshot.channelId)) checks.push(makeCmsReleaseCheck({ siteId, object: revision.object, code: 'content-channel', fieldPath: 'channelId', reference: { kind: 'channel', id: revision.snapshot.channelId }, message: '所属栏目未包含在候选配置中或未有效启用，请明确加入栏目配置' }));
      if (suppressedIds.has(revision.contentId)) checks.push(makeCmsReleaseCheck({ siteId, object: revision.object, code: 'suppression', message: '内容仍处于紧急撤下状态，请先处理撤下原因' }));
      for (const ref of revision.references) {
        const target = byId.get(ref.id);
        if (!visibleContentIds.has(ref.id) || (ref.modelIds?.length && (!target?.modelId || !ref.modelIds.includes(target.modelId)))) checks.push(makeCmsReleaseCheck({ siteId, object: revision.object, code: 'content-reference', reference: { kind: 'content', id: ref.id }, fieldPath: ref.fieldPath, fieldLabel: ref.fieldLabel, message: `引用内容 #${ref.id} 不在候选公开集合中，或模型不符合引用约束`, recommendedAction: 'select-approved' }));
      }
    }
    // A content-only release does not grant visibility into the site's unrelated draft layout.
    if (release.configurationItems.length) checks.push(...inspectCmsReleaseConfiguration({ siteId, configuration, enabledChannelIds, visibleContentIds }));
  } catch (error) {
    if (!(error instanceof HTTPException)) throw error;
    checks.push(makeCmsReleaseCheck({ siteId, object: { kind: 'release', id: release.id, title: release.name, revisionId: null }, kind: 'release', code: 'candidate-configuration', message: error.message, recommendedAction: 'recreate' }));
  }
  const result = uniqueCmsReleaseChecks(checks);
  return { checks: result,
    validation: { inputFingerprint: cmsReleaseInputFingerprint(release), ruleVersion: CMS_RELEASE_CHECK_RULE_VERSION, checkedAt: formatDateTime(new Date()) } };
}
