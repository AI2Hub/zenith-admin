import { resolveEffectivelyEnabledChannelIds, collectCmsReleaseModelValues, inspectCmsReleaseConfiguration, inspectCmsReleaseTaxonomy, makeCmsReleaseCheck, validateCmsStructuredFields, type CmsConfigurationSnapshot, type CmsContent, type CmsRelease, type CmsReleaseCheck, type CmsReleaseDependencyOption } from '@zenith/shared/cms';
import { stableStringify } from '@zenith/shared/core';
import { getMockCmsRevision, getMockCmsRevisionContent, getMockCmsWorkingContent } from './cms-revisions';
import { mockCmsReferencedResourceRights } from './cms-resource-rights';

/** Demo uses the same frozen definitions, reference paths and configuration checks as the server. */
export function inspectMockCmsReleaseReadiness(release: CmsRelease, configuration: CmsConfigurationSnapshot, published: readonly CmsContent[], suppressed: ReadonlySet<number>) {
  const checks: CmsReleaseCheck[] = [];
  const siteId = release.siteId;
  const at = Math.max(Date.now(), release.activateAt ? new Date(release.activateAt.replace(' ', 'T')).getTime() : 0);
  const channels = configuration.tables.cms_channels ?? [];
  const enabledChannelIds = resolveEffectivelyEnabledChannelIds(channels.map(row => ({ id: Number(row.id), parentId: Number(row.parent_id ?? 0), status: row.status as 'enabled' | 'disabled' })));
  const revisions = release.items.flatMap(item => item.revisionId ? [{ item, revision: getMockCmsRevision(item.revisionId), content: getMockCmsRevisionContent(item.revisionId) }] : []);
  const byId = new Map(published.map(row => [row.id, row]));
  for (const row of revisions) byId.set(row.content.id, { ...row.content, status: 'published' });
  for (const item of release.items) if (item.action === 'withdraw') byId.delete(item.contentId);
  const visibleContentIds = new Set([...byId.values()].filter(row => row.status === 'published' && !row.deletedAt && !row.archivedAt && !suppressed.has(row.id)
    && (!row.expireAt || new Date(row.expireAt.replace(' ', 'T')).getTime() > at) && enabledChannelIds.has(row.channelId)).map(row => row.id));
  const uniqueClaims: { contentId: number; modelId: number; key: string; value: string; fieldPath: string; fieldLabel: string; object: CmsReleaseCheck['object'] }[] = [];
  for (const { item, revision, content } of revisions) {
    const object = { kind: 'content' as const, id: content.id, title: content.title, revisionId: item.revisionId };
    const working = getMockCmsWorkingContent(content.id);
    checks.push(...inspectCmsReleaseTaxonomy(siteId, object, configuration, content.modelId, content.tagIds));
    if (!revision || ![working.approvedRevisionId, working.publishedRevisionId].includes(item.revisionId)) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'approval', recommendedAction: 'review', message: '固定修订尚未批准' }));
    if (working.deletedAt || working.archivedAt || working.lockedAt) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'content-state', message: '内容已回收、归档或锁定，不能发布' }));
    if (!enabledChannelIds.has(content.channelId)) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'content-channel', fieldPath: 'channelId', message: '所属栏目未有效启用' }));
    if (suppressed.has(content.id)) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'suppression', message: '内容仍处于紧急撤下状态' }));
    if (content.expireAt && new Date(content.expireAt.replace(' ', 'T')).getTime() <= at) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'content-expiry', fieldPath: 'expireAt', message: '内容在本次上线时已过期' }));
    if (!content.title.trim() || content.title === '未命名内容') checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'title', fieldPath: 'title', message: '请填写正式标题' }));
    for (const [fieldPath, message] of [['summary', '建议填写摘要，便于检索和分享'], ['coverImage', '尚未选择封面'], ['seoTitle', '未设置独立 SEO 标题，将使用内容标题']] as const) {
      if (!content[fieldPath]?.trim()) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: fieldPath, fieldPath, message, severity: 'warning' }));
    }
    const fields = content.modelFields ?? [];
    for (const issue of validateCmsStructuredFields(fields, content.extend ?? {}, true)) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: issue.rule, fieldPath: issue.fieldPath, message: issue.message, severity: issue.severity }));
    const values = collectCmsReleaseModelValues(fields, content.extend ?? {});
    const references = [...values.references, ...(content.relatedIds ?? []).map(id => ({ id, fieldPath: 'relatedIds', fieldLabel: '关联内容', modelIds: undefined }))];
    for (const ref of references) {
      const target = byId.get(ref.id);
      if (!visibleContentIds.has(ref.id) || (ref.modelIds?.length && (!target?.modelId || !ref.modelIds.includes(target.modelId)))) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'content-reference', fieldPath: ref.fieldPath, fieldLabel: ref.fieldLabel, reference: { kind: 'content', id: ref.id }, recommendedAction: 'select-approved', message: `引用内容 #${ref.id} 不在候选公开集合中，或模型不符合引用约束` }));
    }
    for (const value of values.uniqueValues) if (content.modelId) uniqueClaims.push({ ...value, value: stableStringify(value.value), contentId: content.id, modelId: content.modelId, object });
    for (const rights of mockCmsReferencedResourceRights(content)) if (rights.revoked || (rights.expiresAt && new Date(rights.expiresAt.replace(' ', 'T')).getTime() <= at)) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'asset-rights', fieldPath: 'assetVersions', message: '固定素材已撤权或将在上线前到期' }));
  }
  for (const claim of uniqueClaims) {
    const duplicate = uniqueClaims.some(other => other !== claim && other.modelId === claim.modelId && other.key === claim.key && other.value === claim.value);
    const occupied = published.some(other => other.id !== claim.contentId && other.modelId === claim.modelId && collectCmsReleaseModelValues(other.modelFields ?? [], other.extend ?? {}).uniqueValues.some(value => value.key === claim.key && stableStringify(value.value) === claim.value));
    if (duplicate || occupied) checks.push(makeCmsReleaseCheck({ siteId, object: claim.object, kind: 'unique', code: 'model-unique', fieldPath: claim.fieldPath, fieldLabel: claim.fieldLabel, message: '模型唯一字段值已被其他内容或组件使用' }));
  }
  if (release.configurationItems.length) checks.push(...inspectCmsReleaseConfiguration({ siteId, configuration, enabledChannelIds, visibleContentIds }));
  const dependencyOptions: CmsReleaseDependencyOption[] = [];
  for (const id of new Set(checks.flatMap(check => check.recommendedAction === 'select-approved' && check.reference?.kind === 'content' ? [check.reference.id] : []))) {
    if (release.items.some(item => item.contentId === id)) continue;
    try {
      const content = getMockCmsWorkingContent(id);
      if (content.siteId !== siteId || content.deletedAt || content.archivedAt || content.lockedAt || suppressed.has(id)) continue;
      for (const revisionId of new Set([content.approvedRevisionId, content.publishedRevisionId])) {
        const revision = revisionId ? getMockCmsRevision(revisionId) : null;
        if (revision) dependencyOptions.push({ contentId: id, revisionId: revision.id, revisionVersion: revision.version, title: revision.title, hash: revision.hash });
      }
    } catch { /* An inaccessible target does not expose its draft through suggestions. */ }
  }
  return { checks, dependencyOptions };
}
