import { queueMockCmsDelivery } from './cms-delivery';
import type { OutputOf } from '@zenith/shared/core';
import { cmsDocumentAnchorStatus, type CmsEditorialNoteReply } from '@zenith/shared/cms';
import { cmsEditorialContract, cmsModelContract, cmsResourceContract, cmsTranslationSourceChanged, diffCmsFieldDefinitions, hasBreakingCmsFieldChanges, validateCmsStructuredFields, type CmsEditorialNote, type CmsModelVersion } from '@zenith/shared/cms';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem, updateItem } from '../utils/crud';
import { badRequest, conflict, nextIdFrom } from '../utils/handlers';
import { mockDateTime } from '../utils/date';
import { getNextCmsContentId, mockCmsChannels, mockCmsContents, mockCmsContentVersions, mockCmsModels, mockCmsResources, mockCmsSites } from '../data/cms';
import { compileMockCmsFields, mockCmsModelHash } from '../utils/cms-model-compiler';
import { freezeMockCmsRevision, getMockCmsRevision, getMockCmsRevisionContent, getMockCmsWorkingContent, getMockCmsDistributionConflict, resolveMockCmsDistribution, saveMockCmsWorkingContent } from '../utils/cms-revisions';

const notes: CmsEditorialNote[] = [];
let nextReplyId = 1;
export function resetMockCmsEditorialNotes() { notes.length = 0; nextReplyId = 1; }
export const getMockCmsUnresolvedNoteContentIds = () => new Set(notes.filter((note) => !note.resolved).map((note) => note.contentId));
const rights: (OutputOf<typeof cmsResourceContract.rights> & { id: number })[] = [];
export const getMockCmsAssetRights = (resourceId: number): OutputOf<typeof cmsResourceContract.rights> => rights.find(row => row.resourceId === resourceId) ?? { resourceId, source: null, license: null, expiresAt: null, revoked: false, tags: [], alt: null };
const modelVersions: CmsModelVersion[] = [];
const initialModelFields = new Map(mockCmsModels.map((row) => [row.id, structuredClone(row.fields ?? [])]));
const publishedModelIds = new Set(initialModelFields.keys());
export function resetMockCmsModelVersions() {
  modelVersions.length = 0;
  publishedModelIds.clear();
  for (const id of initialModelFields.keys()) publishedModelIds.add(id);
}
const content = getMockCmsWorkingContent;
const model = (id: number) => requireItem(mockCmsModels, id, '模型不存在', { status: 404 });
function modelVersion(id: number) {
  const current = model(id);
  let version = modelVersions.filter((item) => item.modelId === id).at(-1);
  if (!version) {
    version = { id: nextIdFrom(modelVersions), modelId: id, version: 1, fields: structuredClone(initialModelFields.get(id) ?? current.fields ?? []), contentHash: `demo-model-${id}-1`, createdAt: mockDateTime() };
    modelVersions.push(version);
    current.publishedVersionId = version.id;
  }
  return version;
}

export function getMockCmsPublishedModelFields(id: number) {
  if (!publishedModelIds.has(id)) return [];
  const current = model(id);
  const initial = modelVersion(id);
  return structuredClone(modelVersions.find((version) => version.id === current.publishedVersionId && version.modelId === id)?.fields ?? initial.fields);
}
export function getMockCmsModelVersionFields(id: number, versionId: number) {
  modelVersion(id);
  const version = modelVersions.find(item => item.modelId === id && item.id === versionId);
  if (!version) throw new MockHttpError(badRequest('模型版本不存在', { status: 400 }));
  return structuredClone(version.fields);
}

export const cmsEditorialHandlers = [
  mock(cmsEditorialContract.metrics, ({ query, ok }) => {
    const rows = mockCmsContents.filter((item) => item.siteId === query.siteId && !(item as typeof item & { deleted?: boolean }).deleted).map((item) => getMockCmsWorkingContent(item.id));
    const ids = new Set(rows.map((item) => item.id));
    const now = mockDateTime();
    return ok({ total: rows.length, working: rows.filter((row) => row.editorialStatus === 'draft').length,
      pending: rows.filter((row) => row.editorialStatus === 'pending').length,
      overdue: rows.filter((row) => row.dueAt && row.dueAt < now && row.editorialStatus !== 'clean').length,
      scheduled: rows.filter((row) => row.scheduledAt && row.scheduledAt > now).length,
      unpublishedChanges: rows.filter((row) => row.hasUnpublishedChanges).length,
      unresolvedNotes: notes.filter((note) => ids.has(note.contentId) && !note.resolved).length });
  }),
  mock(cmsEditorialContract.notes, ({ params, ok }) => {
    const row = content(params.id);
    return ok(notes.filter((note) => note.contentId === params.id).map((note) => ({ ...note, anchorStatus: cmsDocumentAnchorStatus(row.bodyDocument, note.anchor) })));
  }),
  mock(cmsEditorialContract.addNote, ({ params, body, ok }) => {
    const row = content(params.id);
    if (body.revisionId && !mockCmsContentVersions.some((version) => version.id === body.revisionId && version.contentId === params.id)) return badRequest('修订不属于当前内容', { status: 400 });
    const target = body.revisionId ? getMockCmsRevisionContent(body.revisionId) : row;
    if (body.anchor && !body.revisionId && row.version !== body.expectedVersion) return conflict('内容已变化，请刷新后重新选择批注段落', { status: 409 });
    if (body.anchor && cmsDocumentAnchorStatus(target.bodyDocument, body.anchor) !== 'current') return conflict('批注段落或引用文本已变化', { status: 409 });
    const note: CmsEditorialNote = { id: nextIdFrom(notes), contentId: params.id, revisionId: body.revisionId ?? null, fieldPath: body.fieldPath ?? null, message: body.message,
      anchor: body.anchor ?? null, anchorStatus: cmsDocumentAnchorStatus(row.bodyDocument, body.anchor), replies: [], resolvedBy: null, resolvedByName: null, resolvedAt: null,
      mentionedUserIds: body.mentionedUserIds ?? [], resolved: false, createdBy: 1, createdByName: '演示管理员', createdAt: mockDateTime(), updatedAt: mockDateTime() };
    notes.push(note);
    return ok(note);
  }),
  mock(cmsEditorialContract.resolveNote, ({ params, body, ok }) => {
    content(params.id);
    const note = requireItem(notes, params.noteId, '批注不存在', { status: 404 });
    if (note.contentId !== params.id) return badRequest('批注不属于当前内容', { status: 400 });
    return ok(updateItem(notes, note.id, { ...body, resolvedBy: body.resolved ? 1 : null, resolvedByName: body.resolved ? '演示管理员' : null, resolvedAt: body.resolved ? mockDateTime() : null }, { notFoundMessage: '批注不存在', now: mockDateTime }));
  }),
  mock(cmsEditorialContract.replyNote, ({ params, body, ok }) => {
    content(params.id);
    const note = requireItem(notes, params.noteId, '批注不存在', { status: 404 });
    if (note.contentId !== params.id) return badRequest('批注不属于当前内容', { status: 400 });
    if (note.resolved) return conflict('请先重新打开批注会话，再添加回复', { status: 409 });
    const reply: CmsEditorialNoteReply = { id: nextReplyId++, noteId: note.id, message: body.message, mentionedUserIds: body.mentionedUserIds ?? [], createdBy: 1, createdByName: '演示管理员', createdAt: mockDateTime(), updatedAt: mockDateTime() };
    note.replies.push(reply);
    return ok(reply);
  }),
  mock(cmsEditorialContract.quality, ({ params, ok }) => {
    const row = content(params.id);
    const fields = row.modelId ? modelVersion(row.modelId).fields : [];
    const issues = validateCmsStructuredFields(fields, row.extend, true);
    if (!row.summary) issues.push({ rule: 'summary', fieldPath: 'summary', message: '建议填写摘要', severity: 'warning' });
    if (!row.coverImage) issues.push({ rule: 'cover', fieldPath: 'coverImage', message: '尚未选择封面', severity: 'warning' });
    return ok({ version: row.version, issues });
  }),
  mock(cmsEditorialContract.translations, ({ params, ok }) => {
    const current = content(params.id);
    const source = content(current.translationOfId ?? current.id);
    return ok(mockCmsContents.filter((row) => row.siteId === source.siteId && (row.id === source.id || row.translationOfId === source.id)).map((row) => {
      const revision = row.sourceRevisionId ? getMockCmsRevision(row.sourceRevisionId) : undefined;
      const baseline = revision?.contentId === source.id ? getMockCmsRevisionContent(revision.id) : null;
      return { id: row.id, title: row.title, locale: row.locale ?? 'zh-CN', status: row.status, sourceRevisionId: row.sourceRevisionId ?? null,
        sourceChanged: row.id !== source.id && cmsTranslationSourceChanged(source, baseline, source.modelFields, baseline?.modelFields) };
    }));
  }),
  mock(cmsEditorialContract.createTranslation, ({ params, body, ok }) => {
    const original = content(params.id);
    const source = content(original.translationOfId ?? original.id);
    const channel = requireItem(mockCmsChannels, body.channelId, '栏目不存在', { status: 404 });
    if (channel.siteId !== source.siteId) return badRequest('栏目不属于来源站点', { status: 400 });
    if (source.locale === body.locale || mockCmsContents.some((row) => row.translationOfId === source.id && row.locale === body.locale)) return conflict('该语言的变体已存在', { status: 409 });
    const revision = freezeMockCmsRevision(source.id, 'checkpoint');
    const { revisionId: _revisionId, contentHash: _contentHash, ...snapshot } = getMockCmsRevisionContent(revision.id);
    const created = { ...structuredClone(snapshot), id: getNextCmsContentId(), ...body, translationOfId: source.id,
      sourceRevisionId: revision.id,
      status: 'draft' as const, editorialStatus: 'draft' as const, version: 1, publishedRevisionId: null, approvedRevisionId: null, submittedRevisionId: null, hasUnpublishedChanges: true,
      slug: null, staticPath: null, scheduledAt: null, expireAt: null, createdAt: mockDateTime(), updatedAt: mockDateTime() };
    mockCmsContents.push(created);
    return ok({ id: created.id });
  }),
  mock(cmsEditorialContract.distributionConflict, ({ params, ok }) => ok(getMockCmsDistributionConflict(params.id))),
  mock(cmsEditorialContract.resolveDistribution, ({ params, body, ok }) => ok({ version: resolveMockCmsDistribution(params.id, body.expectedVersion, body.choices).version })),
  mock(cmsEditorialContract.previewConversion, ({ params, body, ok }) => {
    const row = content(params.id);
    const version = modelVersion(body.modelId);
    const values = Object.fromEntries(version.fields.flatMap((field) => {
      const source = body.fieldMapping?.[field.name] ?? field.name;
      return row.extend[source] === undefined ? [] : [[field.name, row.extend[source]]];
    }));
    const used = new Set(version.fields.map((field) => body.fieldMapping?.[field.name] ?? field.name));
    return ok({ version: row.version, modelVersionId: version.id, values, droppedFields: Object.keys(row.extend).filter((name) => !used.has(name)), issues: validateCmsStructuredFields(version.fields, values, false) });
  }),
  mock(cmsEditorialContract.convertType, ({ params, body, ok }) => {
    const row = content(params.id);
    if (row.version !== body.expectedVersion) return conflict('内容版本已变化', { status: 409 });
    const version = modelVersion(body.modelId);
    const values = Object.fromEntries(version.fields.flatMap((field) => row.extend[body.fieldMapping?.[field.name] ?? field.name] === undefined ? [] : [[field.name, row.extend[body.fieldMapping?.[field.name] ?? field.name]]]));
    if (Object.keys(row.extend).some((key) => !version.fields.some((field) => (body.fieldMapping?.[field.name] ?? field.name) === key)) && !body.acknowledgeLoss) return badRequest('请确认未映射字段损失', { status: 400 });
    if (validateCmsStructuredFields(version.fields, values, false).length) return badRequest('字段映射不符合目标模型', { status: 400 });
    const updated = saveMockCmsWorkingContent(params.id, { modelId: body.modelId, modelVersionId: version.id, extend: values }, body.expectedVersion);
    return ok({ version: updated.version });
  }),
  mock(cmsModelContract.versions, ({ params, ok }) => { modelVersion(params.id); return ok(modelVersions.filter((version) => version.modelId === params.id)); }),
  mock(cmsModelContract.publish, async ({ params, ok }) => {
    return ok(await publishMockCmsModelVersion(params.id));
  }),
  mock(cmsModelContract.publishImpact, async ({ params, query, ok }) => {
    const current = model(params.id);
    if (query.siteId !== undefined && current.ownerSiteId != null && current.ownerSiteId !== query.siteId) return badRequest('模型不属于本站', { status: 404 });
    const { fields } = await compileMockCmsFields(current.fields ?? [], current.ownerSiteId);
    const previous = publishedModelIds.has(current.id) ? modelVersion(current.id) : undefined;
    const inScope = (siteId: number) => query.siteId === undefined || siteId === query.siteId;
    return ok({ modelId: current.id, publishedVersionId: previous?.id ?? null, changes: diffCmsFieldDefinitions(previous?.fields ?? [], fields), breaking: hasBreakingCmsFieldChanges(previous?.fields ?? [], fields), affected: {
      workingCopies: mockCmsContents.filter(row => inScope(row.siteId) && content(row.id).modelId === current.id).length,
      publishedContents: mockCmsContents.filter(row => inScope(row.siteId) && row.status === 'published' && row.modelId === current.id).length,
      channels: mockCmsChannels.filter(row => inScope(row.siteId) && row.modelId === current.id).length,
      sites: mockCmsSites.filter(row => inScope(row.id) && row.modelId === current.id).length,
    } });
  }),
  mock(cmsResourceContract.versions, ({ params, ok }) => {
    const resource = requireItem(mockCmsResources, params.id, '素材不存在', { status: 404 });
    return ok(mockCmsResourceVersions(resource));
  }),
  mock(cmsResourceContract.rights, ({ params, ok }) => {
    requireItem(mockCmsResources, params.id, '素材不存在', { status: 404 });
    return ok(getMockCmsAssetRights(params.id));
  }),
  mock(cmsResourceContract.updateRights, ({ params, body, ok }) => {
    requireItem(mockCmsResources, params.id, '素材不存在', { status: 404 });
    if (!rights.some((row) => row.id === params.id)) rights.push({ id: params.id, resourceId: params.id, source: null, license: null, expiresAt: null, revoked: false, tags: [], alt: null });
    const updated = updateItem(rights, params.id, body, { notFoundMessage: '素材授权不存在' });
    queueMockCmsDelivery(requireItem(mockCmsResources, params.id, '素材不存在', { status: 404 }).siteId, 'rights', true);
    return ok(updated);
  }),
];

export async function publishMockCmsModelVersion(id: number) {
    const row = model(id);
    const { fields } = await compileMockCmsFields(row.fields ?? [], row.ownerSiteId);
    const previous = modelVersions.filter(item => item.modelId === id).at(-1) ?? (initialModelFields.has(id) ? modelVersion(id) : undefined);
    const contentHash = mockCmsModelHash(fields);
    if (previous && mockCmsModelHash(previous.fields) === contentHash) {
      row.hasUnpublishedChanges = false; return row;
    }
    const version = { id: nextIdFrom(modelVersions), modelId: id, version: (previous?.version ?? 0) + 1, fields: structuredClone(fields), contentHash, createdAt: mockDateTime() };
    modelVersions.push(version);
    publishedModelIds.add(row.id);
    return updateItem(mockCmsModels, row.id, { publishedVersionId: version.id, hasUnpublishedChanges: false }, { notFoundMessage: '模型不存在', now: mockDateTime });
}
import { mockCmsResourceVersions } from './cms-media';
