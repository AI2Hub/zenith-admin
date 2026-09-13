import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { MP_MENU_STATUSES } from '../constants';
import { mpAccountIdBody, mpMenuButtonSchema, saveMpMenuSchema } from '../validation';
import { mpAccountIdQuery } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 公众号自定义菜单（每个公众号一份；尚未创建时返回 id 为 0 的空菜单） */
export const mpMenuSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  buttons: z.array(mpMenuButtonSchema),
  status: z.enum(MP_MENU_STATUSES),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpMenu' });

export type MpMenu = z.infer<typeof mpMenuSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpMenuContract = defineContract('/api/mp/menu', {
  get: op.get('/', { access: { permission: 'mp:menu:list' }, query: mpAccountIdQuery, response: mpMenuSchema, summary: '获取自定义菜单' }),
  save: op.post('/save', { access: { permission: 'mp:menu:save' }, audit: '保存公众号菜单', body: saveMpMenuSchema, response: mpMenuSchema, summary: '保存菜单草稿' }),
  publish: op.post('/publish', { access: { permission: 'mp:menu:publish' }, audit: '发布公众号菜单', body: mpAccountIdBody, response: mpMenuSchema, summary: '发布菜单到微信' }),
  pull: op.post('/pull', { access: { permission: 'mp:menu:pull' }, audit: '拉取公众号菜单', body: mpAccountIdBody, response: mpMenuSchema, summary: '从微信拉取菜单' }),
  remove: op.post('/delete', { access: { permission: 'mp:menu:delete' }, audit: '删除公众号菜单', body: mpAccountIdBody, response: mpMenuSchema, summary: '删除微信菜单' }),
}, { auditModule: '公众号菜单', tags: ['公众号菜单'] });
