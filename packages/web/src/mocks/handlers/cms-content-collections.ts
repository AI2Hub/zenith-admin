import { cmsContentCollectionContract, cmsCollectionDefinitionSchema, selectCmsCollectionCandidates, validateCmsCollectionFieldRules, type CmsCollectionDefinition, type CmsContentCollection } from '@zenith/shared/cms';
import { mockCmsChannels, mockCmsContents, mockCmsModels, mockCmsPages, mockCmsSites, mockCmsTags } from '../data/cms';
import { mockCmsContentCollections, mockCmsContentCollectionVersions } from '../data/cms-content-collections';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem, removeItem } from '../utils/crud';
import { mockDateTime } from '../utils/date';
import { filterByKeyword } from '../utils/filter';
import { badRequest, conflict, nextIdFrom } from '../utils/handlers';
import { getMockCmsPublishedContent } from '../utils/cms-revisions';
import { getMockCmsPublishedModelFields, getMockCmsModelVersionFields } from './cms-editorial';
import { stageMockCmsConfigurationDraft } from './cms-releases';

function validateDefinition(siteId: number, definition: CmsCollectionDefinition) {
  requireItem(mockCmsSites, siteId, '站点不存在', { status: 404 });
  const invalid = definition.channelIds.some(id => !mockCmsChannels.some(row => row.id === id && row.siteId === siteId))
    || definition.tagIds.some(id => !mockCmsTags.some(row => row.id === id && row.siteId === siteId))
    || [...definition.pinnedIds, ...definition.excludedIds].some(id => !mockCmsContents.some(row => row.id === id && row.siteId === siteId));
  if (invalid) throw new MockHttpError(badRequest('集合的栏目、分类或内容不存在或不属于本站', { status: 400 }));
  if (definition.modelId) {
    const model = requireItem(mockCmsModels, definition.modelId, '模型不存在', { status: 404 });
    if (model.ownerSiteId != null && model.ownerSiteId !== siteId) throw new MockHttpError(badRequest('模型不属于本站', { status: 400 }));
    const fields = getMockCmsPublishedModelFields(model.id);
    definition.modelVersionId = model.publishedVersionId ?? null;
    if (!definition.modelVersionId) throw new MockHttpError(badRequest('请先发布内容模型版本', { status: 400 }));
    const issues = validateCmsCollectionFieldRules(definition, fields);
    if (issues.length) throw new MockHttpError(badRequest(issues.join('；'), { status: 400 }));
  } else definition.modelVersionId = null;
}
function captureVersion(row: CmsContentCollection) {
  mockCmsContentCollectionVersions.push({ collectionId: row.id, siteId: row.siteId, name: row.name, version: row.version, definition: structuredClone(row.definition), createdAt: mockDateTime() });
  stageMockCmsConfigurationDraft(row.siteId);
}
function channelVisible(siteId: number, channelId: number) {
  const seen = new Set<number>(); let id = channelId;
  while (id) {
    const channel = mockCmsChannels.find(row => row.id === id && row.siteId === siteId);
    if (!channel || channel.status !== 'enabled' || seen.has(id)) return false;
    seen.add(id); id = channel.parentId;
  }
  return true;
}
export function previewMockCmsCollection(id: number) {
  const row = requireItem(mockCmsContentCollections, id, '集合不存在', { status: 404 });
  const candidates = mockCmsContents.filter(content => content.siteId === row.siteId && !content.archivedAt)
    .flatMap(content => { const published = getMockCmsPublishedContent(content.id); return published ? [published] : []; })
    .filter(content => !content.archivedAt && (!content.expireAt || content.expireAt > mockDateTime()) && channelVisible(row.siteId, content.channelId));
  const fields = row.definition.modelId && row.definition.modelVersionId ? getMockCmsModelVersionFields(row.definition.modelId, row.definition.modelVersionId) : [];
  return { version: row.version, items: selectCmsCollectionCandidates(candidates, row.definition, fields).map(content => ({
    id: content.id, title: content.title, reason: row.definition.pinnedIds.includes(content.id) ? '人工固定' : '匹配集合筛选', canonicalUrl: content.canonicalUrl ?? null,
  })) };
}

export const cmsContentCollectionHandlers = [
  mock(cmsContentCollectionContract.list, ({ query, ok, paginate }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    return ok(paginate(filterByKeyword(mockCmsContentCollections.filter(row => row.siteId === query.siteId), query.keyword, [row => row.name, row => row.code]).sort((a, b) => b.id - a.id)));
  }),
  mock(cmsContentCollectionContract.all, ({ query, ok }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    return ok(mockCmsContentCollections.filter(row => row.siteId === query.siteId).sort((a, b) => a.name.localeCompare(b.name)));
  }),
  mock(cmsContentCollectionContract.detail, ({ params, ok }) => ok(requireItem(mockCmsContentCollections, params.id, '集合不存在', { status: 404 }))),
  mock(cmsContentCollectionContract.create, ({ body, ok }) => {
    validateDefinition(body.siteId, body.definition);
    if (mockCmsContentCollections.some(row => row.siteId === body.siteId && row.code === body.code)) return conflict('集合编码已存在', { status: 409 });
    const row: CmsContentCollection = { ...body, id: nextIdFrom(mockCmsContentCollections), description: body.description ?? null, version: 1, createdAt: mockDateTime(), updatedAt: mockDateTime(), createdBy: 1, updatedBy: 1 };
    mockCmsContentCollections.push(row); captureVersion(row); return ok(row);
  }),
  mock(cmsContentCollectionContract.update, ({ params, body, ok }) => {
    const row = requireItem(mockCmsContentCollections, params.id, '集合不存在', { status: 404 });
    if (body.expectedVersion !== row.version) return conflict('集合已被修改，请重新加载', { status: 409 });
    if (body.code && mockCmsContentCollections.some(item => item.id !== row.id && item.siteId === row.siteId && item.code === body.code)) return conflict('集合编码已存在', { status: 409 });
    const definition = cmsCollectionDefinitionSchema.parse(body.definition ?? row.definition);
    validateDefinition(row.siteId, definition);
    const { expectedVersion: _expectedVersion, ...patch } = body;
    Object.assign(row, patch, { definition, version: row.version + 1, updatedAt: mockDateTime() }); captureVersion(row); return ok(row);
  }),
  mock(cmsContentCollectionContract.preview, ({ params, ok }) => ok(previewMockCmsCollection(params.id))),
  mock(cmsContentCollectionContract.versions, ({ params, ok }) => {
    requireItem(mockCmsContentCollections, params.id, '集合不存在', { status: 404 });
    return ok(mockCmsContentCollectionVersions.filter(row => row.collectionId === params.id).sort((a, b) => b.version - a.version).map(({ version, name, definition, createdAt }) => ({ version, name, definition, createdAt })));
  }),
  mock(cmsContentCollectionContract.remove, ({ params, ok }) => {
    const row = requireItem(mockCmsContentCollections, params.id, '集合不存在', { status: 404 });
    const pages = mockCmsPages.some(page => page.siteId === row.siteId && page.blocks.some(block => 'collectionId' in block.props && block.props.collectionId === row.id));
    const settings = requireItem(mockCmsSites, row.siteId, '站点不存在', { status: 404 }).settings;
    const home = settings.themeConfig && typeof settings.themeConfig === 'object' && 'homeSections' in settings.themeConfig ? settings.themeConfig.homeSections : [];
    if (pages || (Array.isArray(home) && home.some(item => item?.collectionId === row.id))) return conflict('集合仍被页面或首页引用，请先解除引用', { status: 409 });
    removeItem(mockCmsContentCollections, row.id, '集合不存在'); stageMockCmsConfigurationDraft(row.siteId); return ok(null);
  }),
];
