import * as z from 'zod';
import { auditFieldsSchema, defineContract, op, idParam, idQuery, keywordQuery, entityStatusQuery, entityStatusSchema, paginationQuery, paginated } from '../../core';
import { cmsModelFieldChangeSchema, cmsNestedFieldDefinitionSchema } from '../model-design';
import { createCmsComponentSchema, publishCmsComponentSchema, updateCmsComponentSchema } from '../component-validation';

export const cmsComponentSchema = z.object({
  id: z.int(), ownerSiteId: z.int().nullable(), ownerSiteName: z.string().nullable(),
  code: z.string(), name: z.string(), description: z.string().nullable(), status: entityStatusSchema,
  fields: z.array(cmsNestedFieldDefinitionSchema), version: z.int(), publishedVersionId: z.int().nullable(), hasUnpublishedChanges: z.boolean(),
  ...auditFieldsSchema, createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'CmsComponent' });
export type CmsComponent = z.infer<typeof cmsComponentSchema>;
export const cmsComponentListItemSchema = cmsComponentSchema.omit({ fields: true }).meta({ id: 'CmsComponentListItem' });
export type CmsComponentListItem = z.infer<typeof cmsComponentListItemSchema>;
export const cmsComponentVersionSchema = z.object({
  id: z.int(), componentId: z.int(), version: z.int(), fields: z.array(cmsNestedFieldDefinitionSchema), componentVersionIds: z.array(z.int()), contentHash: z.string(), createdAt: z.string(),
}).meta({ id: 'CmsComponentVersion' });
export type CmsComponentVersion = z.infer<typeof cmsComponentVersionSchema>;
export const cmsComponentImpactSchema = z.object({
  componentId: z.int(), publishedVersionId: z.int().nullable(), changes: z.array(cmsModelFieldChangeSchema), breaking: z.boolean(),
  models: z.array(z.object({ id: z.int(), name: z.string(), ownerSiteId: z.int().nullable(), workingCopy: z.boolean(), publishedVersion: z.boolean() })),
}).meta({ id: 'CmsComponentImpact' });
export type CmsComponentImpact = z.infer<typeof cmsComponentImpactSchema>;
const scope = z.object({ siteId: idQuery('站点范围；平台管理员可省略') });
export const cmsComponentContract = defineContract('/api/cms/components', {
  list: op.get('/', { access: { permission: 'cms:model:list' }, query: paginationQuery.extend({ ...scope.shape, keyword: keywordQuery('名称 / 编码'), status: entityStatusQuery }), response: paginated(cmsComponentListItemSchema), summary: '内容组件工作稿列表' }),
  all: op.get('/all', { access: { permission: ['cms:model:list', 'cms:content:create', 'cms:content:update'] }, query: scope, response: z.array(cmsComponentSchema), summary: '可引用的已发布组件（固定展开字段）' }),
  detail: op.get('/{id}', { access: { permission: 'cms:model:list' }, params: idParam, response: cmsComponentSchema, summary: '组件工作稿详情（按归属站点校验权限）' }),
  create: op.post('/', { access: { permission: 'cms:model:create' }, body: createCmsComponentSchema, response: cmsComponentSchema, audit: '创建 CMS 内容组件', summary: '创建组件工作稿' }),
  update: op.put('/{id}', { access: { permission: 'cms:model:update' }, params: idParam, body: updateCmsComponentSchema, response: cmsComponentSchema, audit: '更新 CMS 内容组件', summary: '按版本更新组件工作稿' }),
  remove: op.delete('/{id}', { access: { permission: 'cms:model:delete' }, params: idParam, audit: '删除 CMS 内容组件', summary: '删除尚未发布的组件' }),
  publish: op.post('/{id}/publish', { access: { permission: 'cms:model:update' }, params: idParam, query: scope, body: publishCmsComponentSchema, response: cmsComponentSchema, audit: '发布 CMS 内容组件', summary: '冻结展开字段，生成不可变组件版本' }),
  versions: op.get('/{id}/versions', { access: { permission: 'cms:model:list' }, params: idParam, query: scope, response: z.array(cmsComponentVersionSchema), summary: '组件不可变版本' }),
  impact: op.get('/{id}/impact', { access: { permission: 'cms:model:list' }, params: idParam, query: scope, response: cmsComponentImpactSchema, summary: '组件发布前差异和引用模型；已有模型版本保持不变' }),
}, { tags: ['CMS-内容组件'], auditModule: 'CMS内容模型' });
