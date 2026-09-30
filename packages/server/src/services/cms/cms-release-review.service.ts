import { asc, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type * as z from 'zod';
import { CMS_RELEASE_CHECK_RULE_VERSION, cmsReleaseFieldDiffs, makeCmsReleaseCheck, type CmsReleaseChange, type CmsReleaseReview, recreateCmsReleaseSchema, resolveCmsReleaseDependenciesSchema } from '@zenith/shared/cms';
import { readSnapshot, withDbExecutor } from '../../db';
import { asyncTasks, cmsChannels, cmsContents, cmsDeployments, cmsDeploymentStorage } from '../../db/schema';
import { createCmsRelease, getCmsReleaseDetail, requireRelease } from './cms-releases.service';
import { loadCmsRevision } from './cms-content-revisions.service';
import { cmsReleaseInputFingerprint } from './cms-release-fingerprint';
import { cmsGenerationSchemaName, readCmsGenerationConfigurationRows, withCmsGenerationTransaction } from './cms-generation-storage.service';
import { CMS_CONFIGURATION_TABLES, CMS_PUBLIC_SITE_SETTINGS } from './cms-public-settings';
import { channelUrl, contentUrl, customPagePath } from './cms-urls';
import { inspectCmsReleaseReadiness, suggestCmsReleaseDependencies } from './cms-release-readiness.service';
import { inspectCmsReleaseDependencies, uniqueCmsReleaseChecks } from './cms-release-preflight.service';
import { formatDateTime } from '../../lib/datetime';

const CONFIGURATION_KINDS: Record<string, CmsReleaseChange['kind']> = { cms_sites: 'site', cms_channels: 'channel', cms_pages: 'page', cms_widgets: 'widget', cms_resources: 'resource' };
const kindOf = (table: string): CmsReleaseChange['kind'] => CONFIGURATION_KINDS[table] ?? 'navigation';
const hrefOf = (kind: CmsReleaseChange['kind'], siteId: number, id: number) => {
  if (kind === 'content') return `/cms/contents/edit?id=${id}&siteId=${siteId}`;
  if (kind === 'channel') return `/cms/channels?site=${siteId}&channel=${id}`;
  if (kind === 'widget') return `/cms/widgets/edit?id=${id}&siteId=${siteId}`;
  if (kind === 'page') return `/cms/pages?siteId=${siteId}&page=${id}`;
  const pages = { site: 'sites', page: 'pages', widget: 'widgets', resource: 'resources', navigation: 'sites' };
  return `/cms/${pages[kind]}?siteId=${siteId}`;
};
function rowPath(table: string, row: Record<string, unknown> | null): string[] {
  if (!row) return [];
  if (table === 'cms_pages') return [row.is_home ? '/' : `/${customPagePath({ slug: String(row.slug), path: typeof row.path === 'string' ? row.path : null })}`];
  if (table === 'cms_channels' && row.path) return [channelUrl('', String(row.path), 1)];
  return [];
}

export async function getCmsReleaseReview(id: number): Promise<CmsReleaseReview> {
  await requireRelease(id);
  const inspected = await readSnapshot((tx) => withDbExecutor(tx, async () => {
    const release = await requireRelease(id);
    const detail = await getCmsReleaseDetail(id);
    const historical = ['active', 'superseded'].includes(release.status);
    const comparisonGenerationId = historical ? release.baseGenerationId : detail.activeGenerationId;
    const [comparisonStorage] = comparisonGenerationId ? await tx.select({ state: cmsDeploymentStorage.storageState }).from(cmsDeploymentStorage).where(eq(cmsDeploymentStorage.deploymentId, comparisonGenerationId)).limit(1) : [];
    const comparisonAvailable = comparisonGenerationId !== null && (!comparisonStorage || comparisonStorage.state === 'available');
    const candidateAvailable = detail.deployment?.storageState === 'available' && Boolean(detail.deployment.manifestHash);
    const [current] = comparisonGenerationId ? await tx.select({ snapshot: cmsDeployments.snapshot }).from(cmsDeployments).where(eq(cmsDeployments.id, comparisonGenerationId)).limit(1) : [];
    const oldRevisions = new Map(current?.snapshot?.revisions.map((entry) => [entry.contentId, entry.revisionId]) ?? []);
    const report: CmsReleaseReview = { releaseId: id, fingerprint: cmsReleaseInputFingerprint(release), baseGenerationId: release.baseGenerationId,
      currentGenerationId: detail.activeGenerationId, comparisonGenerationId, stale: !historical && detail.activeGenerationId !== release.baseGenerationId,
      changes: [], checks: [], affectedPaths: [], wholeSiteAffected: false, tasks: [], dependencyOptions: [],
      validation: { inputFingerprint: cmsReleaseInputFingerprint(release), ruleVersion: CMS_RELEASE_CHECK_RULE_VERSION, checkedAt: formatDateTime(new Date()) } };
    const releaseObject = { kind: 'release' as const, id, title: release.name, revisionId: null };
    if (comparisonGenerationId && !comparisonAvailable) report.checks.push(makeCmsReleaseCheck({ siteId: release.siteId, object: releaseObject, kind: 'release', severity: 'warning', code: 'comparison-storage', message: '比较代次存储已回收；内容修订差异仍可查看，配置差异和历史路径不再重算。', recommendedAction: 'recreate' }));
    for (const message of detail.blockingChecks) if (!historical || !message.includes('公开代次已变化')) report.checks.push(makeCmsReleaseCheck({ siteId: release.siteId, object: releaseObject, kind: 'release', severity: release.status === 'draft' && message.includes('尚未成功构建') ? 'warning' : 'error', code: 'release', message, recommendedAction: message.includes('公开代次') ? 'recreate' : 'rebuild' }));
    const channels = comparisonAvailable
      ? await tx.execute<{ id: number; path: string; detailPathRule: typeof cmsChannels.$inferSelect.detailPathRule }>(sql.raw(`SELECT id,path,detail_path_rule AS "detailPathRule" FROM "${cmsGenerationSchemaName(comparisonGenerationId)}".cms_channels`))
      : comparisonGenerationId ? [] : await tx.select({ id: cmsChannels.id, path: cmsChannels.path, detailPathRule: cmsChannels.detailPathRule }).from(cmsChannels).where(eq(cmsChannels.siteId, release.siteId));
    const beforeChannels = new Map(channels.map((channel) => [channel.id, channel]));
    const afterChannels = new Map(beforeChannels);
    if (!comparisonAvailable && candidateAvailable && release.deploymentId) {
      const candidateChannels = await tx.execute<{ id: number; path: string; detailPathRule: typeof cmsChannels.$inferSelect.detailPathRule }>(sql`select id,path,detail_path_rule as "detailPathRule" from ${sql.identifier(cmsGenerationSchemaName(release.deploymentId))}.cms_channels`);
      for (const channel of candidateChannels) afterChannels.set(channel.id, channel);
    }
    for (const row of release.configurationSnapshot.tables.cms_channels ?? []) afterChannels.set(Number(row.id), { id: Number(row.id), path: String(row.path), detailPathRule: row.detail_path_rule as typeof cmsChannels.$inferSelect.detailPathRule });
    const contentDates = await tx.select({ id: cmsContents.id, createdAt: cmsContents.createdAt }).from(cmsContents).where(eq(cmsContents.siteId, release.siteId));
    const dates = new Map(contentDates.map((row) => [row.id, row.createdAt]));
    for (const item of release.items) {
      const beforeRevision = oldRevisions.get(item.contentId);
      const before = beforeRevision ? (await loadCmsRevision(tx, beforeRevision)).snapshot : null;
      const after = item.revisionId ? (await loadCmsRevision(tx, item.revisionId)).snapshot : null;
      const fields = cmsReleaseFieldDiffs(before, after);
      const [oldContent] = comparisonAvailable ? await tx.execute<{ publishedAt: string | null }>(sql`SELECT published_at AS "publishedAt" FROM ${sql.raw(`"${cmsGenerationSchemaName(comparisonGenerationId)}".cms_contents`)} WHERE id=${item.contentId}`) : [];
      const [candidateContent] = release.deploymentId && candidateAvailable && detail.deployment?.manifestHash ? await tx.execute<{ publishedAt: string | null }>(sql`SELECT published_at AS "publishedAt" FROM ${sql.raw(`"${cmsGenerationSchemaName(release.deploymentId)}".cms_contents`)} WHERE id=${item.contentId}`) : [];
      const paths = [before, after].flatMap((snapshot, index) => {
        if (index === 0 && comparisonGenerationId && !comparisonAvailable) return [];
        if (index === 1 && historical && release.deploymentId && !candidateAvailable) return [];
        const channel = snapshot ? (index === 0 ? beforeChannels : afterChannels).get(snapshot.channelId) : undefined;
        const publishedAt = index === 0 ? oldContent?.publishedAt ? new Date(oldContent.publishedAt) : null : candidateContent?.publishedAt ? new Date(candidateContent.publishedAt) : release.activateAt ?? new Date();
        return snapshot && channel ? [contentUrl('', channel, { id: item.contentId, slug: snapshot.slug ?? null, staticPath: snapshot.staticPath ?? null, publishedAt, createdAt: dates.get(item.contentId) ?? null }), channelUrl('', channel.path, 1)] : [];
      });
      if (fields.length) report.changes.push({ kind: 'content', id: item.contentId, title: item.title,
        operation: after ? before ? 'update' : 'create' : 'remove', fields, paths: [...new Set(paths)], editPath: hrefOf('content', release.siteId, item.contentId) });
    }
    for (const table of CMS_CONFIGURATION_TABLES) {
      if (comparisonGenerationId && !comparisonAvailable) continue;
      const incoming = release.configurationSnapshot.tables[table];
      if (!incoming) continue;
      const scopeRows = (rows: Record<string, unknown>[]) => rows
        .filter((row) => table === 'cms_sites' ? Number(row.id) === release.siteId : table === 'cms_site_inheritances' ? Number(row.site_id) === release.siteId : true)
        .map((row) => table === 'cms_widgets' ? { id: row.id, code: row.code, name: row.published_name, items: row.published_data, status: row.status, default_renderer_key: row.default_renderer_key }
          : table !== 'cms_sites' ? row : { ...row, settings: Object.fromEntries(CMS_PUBLIC_SITE_SETTINGS.flatMap((key) => {
          const value = (row.settings as Record<string, unknown> | null)?.[key];
          return value == null ? [] : [[key, value]];
        })) });
      const after = scopeRows(incoming);
      const previous = comparisonGenerationId ? await readCmsGenerationConfigurationRows(tx, comparisonGenerationId, table) : [];
      const before = scopeRows(previous);
      const rowKey = (row: Record<string, unknown>) => String(row.id ?? `${row.site_id}:${row.component}`);
      const beforeMap = new Map(before.map((row) => [rowKey(row), row])); const afterMap = new Map(after.map((row) => [rowKey(row), row]));
      const keys = new Set([...afterMap.keys(), ...(release.configurationSnapshot.deleteIds?.[table] ?? []).map(String), ...(release.configurationSnapshot.replaceAll.includes(table) ? beforeMap.keys() : [])]);
      for (const key of keys) {
        const left = beforeMap.get(key) ?? null; const right = afterMap.get(key) ?? null;
        const fields = cmsReleaseFieldDiffs(left, right);
        if (!fields.length) continue;
        const kind = kindOf(table); const target = right ?? left!; const objectId = Number(target.id ?? target.site_id);
        report.changes.push({ kind, id: objectId, title: String(target.name ?? target.title ?? target.code ?? `${table} #${key}`),
          operation: right ? left ? 'update' : 'create' : 'remove', fields, editPath: hrefOf(kind, release.siteId, objectId), paths: [...new Set([...rowPath(table, left), ...rowPath(table, right)])] });
        if (['site', 'channel', 'widget', 'navigation'].includes(kind)) report.wholeSiteAffected = true;
      }
    }
    report.affectedPaths = [...new Set(['/', ...report.changes.flatMap((change) => change.paths)])].sort();
    const deployments = await tx.select({ taskIds: cmsDeployments.taskIds }).from(cmsDeployments).where(eq(cmsDeployments.releaseId, id));
    const taskIds = [...new Set(deployments.flatMap((deployment) => deployment.taskIds))];
    if (taskIds.length) report.tasks = await tx.select({ id: asyncTasks.id, taskType: asyncTasks.taskType, title: asyncTasks.title, status: asyncTasks.status,
      processedCount: asyncTasks.processedCount, totalCount: asyncTasks.totalCount, progressNote: asyncTasks.progressNote, errorMessage: asyncTasks.errorMessage,
    }).from(asyncTasks).where(inArray(asyncTasks.id, taskIds)).orderBy(asc(asyncTasks.id));
    const readiness = await inspectCmsReleaseReadiness(tx, release);
    report.validation = readiness.validation;
    report.checks.push(...readiness.checks);
    if (candidateAvailable && release.deploymentId && release.configurationItems.length) {
      report.checks.push(...await withCmsGenerationTransaction(release.siteId, release.deploymentId, true, candidate => inspectCmsReleaseDependencies(candidate, release.siteId)));
    }
    report.checks = uniqueCmsReleaseChecks(report.checks);
    return { report, release, historical };
  }));
  // Suggestions require current object ACLs, while checks above inspect one consistent fixed input.
  if (!inspected.historical) inspected.report.dependencyOptions = await suggestCmsReleaseDependencies(inspected.release, inspected.report.checks);
  return inspected.report;
}

export async function resolveCmsReleaseDependencies(id: number, input: z.output<typeof resolveCmsReleaseDependenciesSchema>) {
  const release = await requireRelease(id);
  const review = await getCmsReleaseReview(id);
  if (review.stale || review.fingerprint !== input.expectedFingerprint || review.currentGenerationId !== input.expectedGenerationId || release.baseGenerationId !== input.expectedGenerationId) throw new HTTPException(409, { message: '发布范围或线上版本已变化，请刷新检查后重新准备' });
  if (['active', 'superseded', 'cancelled'].includes(release.status)) throw new HTTPException(409, { message: '仅待发布的发布单可以补充依赖' });
  const choices = [...new Set(input.revisionIds)];
  if (choices.some(revisionId => !review.dependencyOptions.some(option => option.revisionId === revisionId))) throw new HTTPException(409, { message: '依赖修订已变化、未批准或无权访问，请刷新检查后选择' });
  return createCmsRelease({ siteId: release.siteId, name: `${release.name.slice(0, 175)}（补充依赖）`,
    revisionIds: [...release.items.flatMap(item => item.revisionId ? [item.revisionId] : []), ...choices],
    withdrawContentIds: release.items.filter(item => item.action === 'withdraw').map(item => item.contentId),
    pageIds: [], widgetIds: [], includeSiteConfiguration: false, timeZone: release.timeZone, autoActivate: false,
  }, { snapshot: structuredClone(release.configurationSnapshot), items: structuredClone(release.configurationItems), baseGenerationId: release.baseGenerationId }, 'manual', input.expectedGenerationId, { id, fingerprint: input.expectedFingerprint });
}

export async function recreateCmsRelease(id: number, input: z.output<typeof recreateCmsReleaseSchema>) {
  const release = await requireRelease(id);
  if (cmsReleaseInputFingerprint(release) !== input.expectedFingerprint) throw new HTTPException(409, { message: '发布草稿已有变化，请重新审阅后再准备' });
  return createCmsRelease({ siteId: release.siteId, name: `${release.name.slice(0, 180)}（重新审阅）`,
    revisionIds: release.items.flatMap((item) => item.revisionId ? [item.revisionId] : []), withdrawContentIds: release.items.filter((item) => item.action === 'withdraw').map((item) => item.contentId),
    pageIds: release.configurationItems.filter((item) => item.kind === 'page').map((item) => item.id), widgetIds: release.configurationItems.filter((item) => item.kind === 'widget').map((item) => item.id),
    includeSiteConfiguration: release.configurationItems.some((item) => item.kind === 'site'), autoActivate: false, timeZone: release.timeZone,
  }, undefined, 'manual', input.expectedGenerationId, { id, fingerprint: input.expectedFingerprint });
}
