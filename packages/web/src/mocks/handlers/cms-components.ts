import { cmsComponentContract, cmsComponentListItemSchema, diffCmsFieldDefinitions, hasBreakingCmsFieldChanges, normalizeCmsFieldDefinitions, type CmsComponent, type CmsFieldDefinition } from '@zenith/shared/cms';
import { mockCmsComponents, mockCmsComponentVersions } from '../data/cms-components';
import { mockCmsModels, mockCmsSites } from '../data/cms';
import { compileMockCmsFields, mockCmsDefinitionHash } from '../utils/cms-model-compiler';
import { mock } from '../utils/contract';
import { requireItem, removeItem } from '../utils/crud';
import { mockDateTime } from '../utils/date';
import { filterByKeyword, matchesFilter } from '../utils/filter';
import { badRequest, conflict, nextIdFrom, notFound } from '../utils/handlers';
import { getMockCmsPublishedModelFields } from './cms-editorial';

const visible = (ownerSiteId: number | null, siteId?: number) => siteId === undefined || ownerSiteId === null || ownerSiteId === siteId;
function usesVersions(fields: readonly CmsFieldDefinition[], ids: Set<number>): boolean {
  return fields.some(field => (field.configuration?.componentVersionId != null && ids.has(field.configuration.componentVersionId))
    || usesVersions(field.configuration?.fields ?? [], ids)
    || field.configuration?.blockTypes?.some(block => (block.componentVersionId != null && ids.has(block.componentVersionId)) || usesVersions(block.fields, ids)));
}
export const cmsComponentHandlers = [
  mock(cmsComponentContract.list, ({ query, paginate, ok }) => {
    const rows = filterByKeyword(mockCmsComponents.filter(row => visible(row.ownerSiteId, query.siteId) && matchesFilter(row.status, query.status)), query.keyword, [row => row.name, row => row.code]);
    return ok(paginate(rows.map(row => cmsComponentListItemSchema.parse(row))));
  }),
  mock(cmsComponentContract.all, ({ query, ok }) => ok(mockCmsComponents.filter(row => visible(row.ownerSiteId, query.siteId) && row.status === 'enabled' && row.publishedVersionId != null).map(row => ({
    ...row, fields: structuredClone(requireItem(mockCmsComponentVersions, row.publishedVersionId!, '组件版本不存在', { status: 404 }).fields),
  })))),
  mock(cmsComponentContract.detail, ({ params, ok }) => ok(requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 }))),
  mock(cmsComponentContract.create, async ({ body, ok }) => {
    if (mockCmsComponents.some(row => row.code === body.code)) return conflict('组件编码已存在', { status: 409 });
    const owner = body.ownerSiteId ? requireItem(mockCmsSites, body.ownerSiteId, '站点不存在', { status: 404 }) : null;
    const { fields } = await compileMockCmsFields(normalizeCmsFieldDefinitions(body.fields), body.ownerSiteId ?? null);
    const row: CmsComponent = { ...body, id: nextIdFrom(mockCmsComponents), fields, ownerSiteId: body.ownerSiteId ?? null, ownerSiteName: owner?.name ?? null, description: body.description ?? null,
      version: 1, publishedVersionId: null, hasUnpublishedChanges: true, createdAt: mockDateTime(), updatedAt: mockDateTime(), createdBy: 1, updatedBy: 1 };
    mockCmsComponents.push(row); return ok(row);
  }),
  mock(cmsComponentContract.update, async ({ params, body, ok }) => {
    const row = requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 });
    if (row.version !== body.expectedVersion) return conflict('内容组件已被其他人修改，请刷新后重试', { status: 409 });
    if (body.code && mockCmsComponents.some(item => item.id !== row.id && item.code === body.code)) return conflict('组件编码已存在', { status: 409 });
    const { expectedVersion: _expectedVersion, ...patch } = body;
    const fields = patch.fields ? (await compileMockCmsFields(normalizeCmsFieldDefinitions(patch.fields, row.fields), row.ownerSiteId, row.id)).fields : row.fields;
    const fieldsChanged = mockCmsDefinitionHash(fields) !== mockCmsDefinitionHash(row.fields);
    if (fieldsChanged || Object.entries(patch).some(([key, value]) => key !== 'fields' && value !== row[key as keyof CmsComponent])) Object.assign(row, patch, { fields, version: row.version + 1, hasUnpublishedChanges: row.hasUnpublishedChanges || fieldsChanged, updatedAt: mockDateTime() });
    return ok(row);
  }),
  mock(cmsComponentContract.publish, async ({ params, query, body, ok }) => {
    const row = requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 });
    if (!visible(row.ownerSiteId, query.siteId)) return notFound('组件不存在', { status: 404 });
    if (row.version !== body.expectedVersion) return conflict('内容组件已被其他人修改，请刷新后重试', { status: 409 });
    if (row.status !== 'enabled' || !row.fields.length) return badRequest('请启用组件并定义至少一个字段', { status: 400 });
    const compiled = await compileMockCmsFields(row.fields, row.ownerSiteId, row.id);
    const previous = mockCmsComponentVersions.filter(item => item.componentId === row.id).at(-1);
    const contentHash = mockCmsDefinitionHash(compiled.fields);
    if (previous?.contentHash !== contentHash) {
      const version = { id: nextIdFrom(mockCmsComponentVersions), componentId: row.id, version: (previous?.version ?? 0) + 1, ...compiled, contentHash, createdAt: mockDateTime() };
      mockCmsComponentVersions.push(version); row.publishedVersionId = version.id; row.version += 1;
    }
    row.hasUnpublishedChanges = false; return ok(row);
  }),
  mock(cmsComponentContract.versions, ({ params, query, ok }) => {
    const row = requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 });
    if (!visible(row.ownerSiteId, query.siteId)) return notFound('组件不存在', { status: 404 });
    return ok(mockCmsComponentVersions.filter(item => item.componentId === row.id).reverse());
  }),
  mock(cmsComponentContract.impact, async ({ params, query, ok }) => {
    const row = requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 });
    if (!visible(row.ownerSiteId, query.siteId)) return notFound('组件不存在', { status: 404 });
    const { fields } = await compileMockCmsFields(row.fields, row.ownerSiteId, row.id);
    const previous = mockCmsComponentVersions.find(item => item.id === row.publishedVersionId)?.fields ?? [];
    const ids = new Set(mockCmsComponentVersions.filter(item => item.componentId === row.id).map(item => item.id));
    const models = mockCmsModels.filter(model => visible(model.ownerSiteId, query.siteId)).map(model => ({ id: model.id, name: model.name, ownerSiteId: model.ownerSiteId,
      workingCopy: usesVersions(model.fields ?? [], ids), publishedVersion: usesVersions(getMockCmsPublishedModelFields(model.id), ids),
    })).filter(model => model.workingCopy || model.publishedVersion);
    return ok({ componentId: row.id, publishedVersionId: row.publishedVersionId, changes: diffCmsFieldDefinitions(previous, fields), breaking: hasBreakingCmsFieldChanges(previous, fields), models });
  }),
  mock(cmsComponentContract.remove, ({ params, ok }) => {
    requireItem(mockCmsComponents, params.id, '组件不存在', { status: 404 });
    if (mockCmsComponentVersions.some(version => version.componentId === params.id)) return conflict('已发布组件保留历史版本，请停用组件', { status: 409 });
    removeItem(mockCmsComponents, params.id, '组件不存在'); return ok(null);
  }),
];
