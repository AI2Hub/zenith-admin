import * as z from 'zod';
import { auditFieldsSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { MP_DRAFT_STATUSES } from '../constants';
import { createMpDraftSchema, mpArticleSchema, updateMpDraftSchema } from '../validation';
import { mpAccountIdQuery } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const mpDraftSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  title: z.string().meta({ description: '取首篇文章标题' }),
  articles: z.array(mpArticleSchema),
  wechatMediaId: z.string().nullable().meta({ description: '推送到微信草稿箱后回填的 media_id' }),
  status: z.enum(MP_DRAFT_STATUSES),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpDraft' });

export type MpDraft = z.infer<typeof mpDraftSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const mpDraftListQuery = paginationQuery.extend({
  ...mpAccountIdQuery.shape,
  keyword: keywordQuery('标题'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpDraftContract = defineContract('/api/mp/drafts', {
  list: op.get('/', { access: { permission: 'mp:draft:list' }, query: mpDraftListQuery, response: paginated(mpDraftSchema), summary: '图文草稿列表' }),
  detail: op.get('/{id}', { access: { permission: 'mp:draft:list' }, params: idParam, response: mpDraftSchema, summary: '图文草稿详情' }),
  create: op.post('/', { access: { permission: 'mp:draft:create' }, audit: '创建图文草稿', body: createMpDraftSchema, response: mpDraftSchema, summary: '创建图文草稿' }),
  update: op.put('/{id}', { access: { permission: 'mp:draft:update' }, audit: '更新图文草稿', params: idParam, body: updateMpDraftSchema, response: mpDraftSchema, summary: '更新图文草稿' }),
  push: op.post('/{id}/push', { access: { permission: 'mp:draft:push' }, audit: '推送图文草稿', params: idParam, response: mpDraftSchema, summary: '推送到微信草稿箱' }),
  remove: op.delete('/{id}', { access: { permission: 'mp:draft:delete' }, audit: '删除图文草稿', params: idParam, summary: '删除图文草稿' }),
}, { auditModule: '公众号图文', tags: ['公众号图文'] });
