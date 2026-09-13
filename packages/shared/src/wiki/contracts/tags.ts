import * as z from 'zod';
import { auditFieldsSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWikiTagSchema, updateWikiTagSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const wikiTagSchema = z.object({
  id: z.int(),
  name: z.string().meta({ example: '新人必读' }),
  color: z.string().nullable().meta({ example: '#3b82f6' }),
  docCount: z.int().optional().meta({ description: '关联文档数（列表返回）' }),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WikiTag' });

export type WikiTag = z.infer<typeof wikiTagSchema>;

/** 文档上挂载的标签摘要 */
export const wikiDocTagSchema = wikiTagSchema.pick({ id: true, name: true, color: true }).meta({ id: 'WikiDocTag' });

export type WikiDocTag = z.infer<typeof wikiDocTagSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const wikiTagListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称'),
});

export const wikiTagContract = defineContract('/api/wiki/tags', {
  list: op.get('/', { access: { permission: 'wiki:tag:list' }, query: wikiTagListQuery, response: paginated(wikiTagSchema), summary: '标签列表' }),
  all: op.get('/all', { access: { permission: 'wiki:doc:list' }, response: z.array(wikiTagSchema), summary: '全部标签（编辑器打标）' }),
  create: op.post('/', { access: { permission: 'wiki:tag:create' }, audit: '创建标签', body: createWikiTagSchema, response: wikiTagSchema, summary: '创建标签' }),
  update: op.put('/{id}', { access: { permission: 'wiki:tag:edit' }, audit: '更新标签', params: idParam, body: updateWikiTagSchema, response: wikiTagSchema, summary: '更新标签' }),
  remove: op.delete('/{id}', { access: { permission: 'wiki:tag:delete' }, audit: '删除标签', params: idParam, summary: '删除标签' }),
}, { auditModule: '知识中心', tags: ['知识中心-标签'] });
