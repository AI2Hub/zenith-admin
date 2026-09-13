import * as z from 'zod';
import { auditFieldsSchema, entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWikiTemplateSchema, updateWikiTemplateSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const wikiTemplateSchema = z.object({
  id: z.int(),
  name: z.string().meta({ example: '会议纪要' }),
  description: z.string().nullable(),
  content: z.string().meta({ description: 'Markdown 模板正文' }),
  status: entityStatusSchema,
  sort: z.int(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WikiTemplate' });

export type WikiTemplate = z.infer<typeof wikiTemplateSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const wikiTemplateListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 描述'),
  status: entityStatusQuery,
});

export const wikiTemplateContract = defineContract('/api/wiki/templates', {
  list: op.get('/', { access: { permission: 'wiki:template:list' }, query: wikiTemplateListQuery, response: paginated(wikiTemplateSchema), summary: '文档模板列表' }),
  all: op.get('/all', { access: { permission: 'wiki:doc:list' }, response: z.array(wikiTemplateSchema), summary: '全部启用模板（编辑器选用）' }),
  detail: op.get('/{id}', { access: { permission: 'wiki:template:list' }, params: idParam, response: wikiTemplateSchema, summary: '模板详情' }),
  create: op.post('/', { access: { permission: 'wiki:template:create' }, audit: '创建文档模板', body: createWikiTemplateSchema, response: wikiTemplateSchema, summary: '创建模板' }),
  update: op.put('/{id}', { access: { permission: 'wiki:template:edit' }, audit: '更新文档模板', params: idParam, body: updateWikiTemplateSchema, response: wikiTemplateSchema, summary: '更新模板' }),
  remove: op.delete('/{id}', { access: { permission: 'wiki:template:delete' }, audit: '删除文档模板', params: idParam, summary: '删除模板' }),
}, { auditModule: '知识中心', tags: ['知识中心-模板'] });
