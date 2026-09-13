import * as z from 'zod';
import { auditFieldsSchema, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createMpKfAccountSchema, mpAccountIdBody, updateMpKfAccountSchema } from '../validation';
import { mpAccountIdQuery, mpSyncResultSchema } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const mpKfAccountSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  kfAccount: z.string().meta({ description: '客服账号（xxx@公众号原始 ID）' }),
  nickname: z.string(),
  avatar: z.string().nullable(),
  kfId: z.string().nullable().meta({ description: '微信侧客服工号' }),
  inviteStatus: z.string().meta({ description: '邀请绑定状态（none / inviting / bound 等）' }),
  inviteWx: z.string().nullable(),
  status: entityStatusSchema,
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpKfAccount' });

export type MpKfAccount = z.infer<typeof mpKfAccountSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const mpKfAccountListQuery = paginationQuery.extend({
  ...mpAccountIdQuery.shape,
  keyword: keywordQuery('客服昵称'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpKfAccountContract = defineContract('/api/mp/kf-accounts', {
  list: op.get('/', { access: { permission: 'mp:kf:list' }, query: mpKfAccountListQuery, response: paginated(mpKfAccountSchema), summary: '客服账号列表' }),
  sync: op.post('/sync', { access: { permission: 'mp:kf:sync' }, audit: '同步客服账号', body: mpAccountIdBody, response: mpSyncResultSchema, summary: '从微信同步客服账号' }),
  create: op.post('/', { access: { permission: 'mp:kf:create' }, audit: '添加客服账号', body: createMpKfAccountSchema, response: mpKfAccountSchema, summary: '添加客服账号' }),
  update: op.put('/{id}', { access: { permission: 'mp:kf:update' }, audit: '修改客服账号', params: idParam, body: updateMpKfAccountSchema, response: mpKfAccountSchema, summary: '修改客服昵称' }),
  remove: op.delete('/{id}', { access: { permission: 'mp:kf:delete' }, audit: '删除客服账号', params: idParam, summary: '删除客服账号' }),
}, { auditModule: '公众号多客服', tags: ['公众号多客服'] });
