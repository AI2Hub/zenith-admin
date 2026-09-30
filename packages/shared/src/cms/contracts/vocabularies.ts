import * as z from 'zod';
import { auditFieldsSchema, idParam, requiredIdQuery, paginationQuery, paginated, keywordQuery, entityStatusSchema } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createCmsVocabularySchema, updateCmsVocabularySchema } from '../taxonomy';

export const cmsVocabularySchema = z.object({
  id: z.int(), siteId: z.int(), name: z.string(), code: z.string(), description: z.string().nullable(),
  modelIds: z.array(z.int()), required: z.boolean(), maxSelections: z.int(), status: entityStatusSchema, sort: z.int(),
  ...auditFieldsSchema, createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'CmsVocabulary' });
export type CmsVocabulary = z.infer<typeof cmsVocabularySchema>;
export const cmsVocabularyContract = defineContract('/api/cms/vocabularies', {
  list: op.get('/', { access: { permission: 'cms:taxonomy:list' }, query: paginationQuery.extend({ siteId: requiredIdQuery(), keyword: keywordQuery('词表名称 / 编码') }), response: paginated(cmsVocabularySchema), summary: '受控词表列表' }),
  all: op.get('/all', { access: { permission: ['cms:content:list', 'cms:taxonomy:list'] }, query: z.object({ siteId: requiredIdQuery() }), response: z.array(cmsVocabularySchema), summary: '本站可用词表' }),
  detail: op.get('/{id}', { access: { permission: 'cms:taxonomy:list' }, params: idParam, response: cmsVocabularySchema, summary: '词表详情' }),
  create: op.post('/', { access: { permission: 'cms:taxonomy:manage' }, body: createCmsVocabularySchema, response: cmsVocabularySchema, audit: '创建受控词表', summary: '创建受控词表' }),
  update: op.put('/{id}', { access: { permission: 'cms:taxonomy:manage' }, params: idParam, body: updateCmsVocabularySchema, response: cmsVocabularySchema, audit: '更新受控词表', summary: '更新受控词表' }),
  remove: op.delete('/{id}', { access: { permission: 'cms:taxonomy:manage' }, params: idParam, audit: '删除受控词表', summary: '删除空词表' }),
}, { tags: ['CMS-受控分类'], auditModule: 'CMS内容管理' });
