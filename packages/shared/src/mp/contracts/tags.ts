import * as z from 'zod';
import { auditFieldsSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createMpTagSchema, mpAccountIdBody, updateMpTagSchema } from '../validation';
import { mpAccountIdQuery, mpSyncResultSchema } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const mpTagSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  wechatTagId: z.int().nullable().meta({ description: '微信侧标签 ID，未同步为 null' }),
  name: z.string(),
  fansCount: z.int(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpTag' });

export type MpTag = z.infer<typeof mpTagSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const mpTagListQuery = paginationQuery.extend({
  ...mpAccountIdQuery.shape,
  keyword: keywordQuery('标签名'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpTagContract = defineContract('/api/mp/tags', {
  list: op.get('/', { access: { permission: 'mp:tag:list' }, query: mpTagListQuery, response: paginated(mpTagSchema), summary: '标签列表' }),
  sync: op.post('/sync', { access: { permission: 'mp:tag:sync' }, audit: '同步公众号标签', body: mpAccountIdBody, response: mpSyncResultSchema, summary: '从微信同步标签' }),
  create: op.post('/', { access: { permission: 'mp:tag:create' }, audit: '创建公众号标签', body: createMpTagSchema, response: mpTagSchema, summary: '创建标签' }),
  update: op.put('/{id}', { access: { permission: 'mp:tag:update' }, audit: '更新公众号标签', params: idParam, body: updateMpTagSchema, response: mpTagSchema, summary: '更新标签' }),
  remove: op.delete('/{id}', { access: { permission: 'mp:tag:delete' }, audit: '删除公众号标签', params: idParam, summary: '删除标签' }),
}, { auditModule: '公众号标签', tags: ['公众号标签'] });
