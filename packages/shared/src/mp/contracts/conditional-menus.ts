import * as z from 'zod';
import { idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { MP_MENU_STATUSES } from '../constants';
import {
  createMpConditionalMenuSchema,
  mpMenuButtonSchema,
  mpMenuMatchRuleSchema,
  tryMatchMpMenuSchema,
  updateMpConditionalMenuSchema,
} from '../validation';
import { mpAccountIdQuery } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 个性化菜单：按匹配规则下发给特定人群 */
export const mpConditionalMenuSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  name: z.string(),
  buttons: z.array(mpMenuButtonSchema),
  matchRule: mpMenuMatchRuleSchema,
  menuId: z.string().nullable().meta({ description: '微信侧 menuid，发布后回填' }),
  status: z.enum(MP_MENU_STATUSES),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpConditionalMenu' });

export type MpConditionalMenu = z.infer<typeof mpConditionalMenuSchema>;

/** 菜单匹配测试结果：某用户实际命中的菜单按钮 */
export const mpMenuTryMatchSchema = z.object({
  buttons: z.array(mpMenuButtonSchema),
}).meta({ id: 'MpMenuTryMatch' });

export type MpMenuTryMatch = z.infer<typeof mpMenuTryMatchSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpConditionalMenuContract = defineContract('/api/mp/conditional-menus', {
  list: op.get('/', { access: { permission: 'mp:condmenu:list' }, query: mpAccountIdQuery, response: z.array(mpConditionalMenuSchema), summary: '个性化菜单列表' }),
  tryMatch: op.post('/trymatch', { access: { permission: 'mp:condmenu:list' }, body: tryMatchMpMenuSchema, response: mpMenuTryMatchSchema, summary: '菜单匹配测试' }),
  create: op.post('/', { access: { permission: 'mp:condmenu:create' }, audit: '新增个性化菜单', body: createMpConditionalMenuSchema, response: mpConditionalMenuSchema, summary: '新增个性化菜单' }),
  update: op.put('/{id}', { access: { permission: 'mp:condmenu:update' }, audit: '编辑个性化菜单', params: idParam, body: updateMpConditionalMenuSchema, response: mpConditionalMenuSchema, summary: '编辑个性化菜单' }),
  publish: op.post('/{id}/publish', { access: { permission: 'mp:condmenu:publish' }, audit: '发布个性化菜单', params: idParam, response: mpConditionalMenuSchema, summary: '发布个性化菜单' }),
  remove: op.delete('/{id}', { access: { permission: 'mp:condmenu:delete' }, audit: '删除个性化菜单', params: idParam, summary: '删除个性化菜单' }),
}, { auditModule: '公众号个性化菜单', tags: ['公众号个性化菜单'] });
