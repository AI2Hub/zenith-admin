import * as z from 'zod';
import { idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createCheckinRuleSchema, updateCheckinRuleSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 连续签到第 N 天的奖励规则 */
export const checkinRuleSchema = z.object({
  id: z.int(),
  dayNumber: z.int(),
  points: z.int(),
  experience: z.int(),
  remark: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'CheckinRule' });

export type CheckinRule = z.infer<typeof checkinRuleSchema>;

// ─── 契约（后台） ────────────────────────────────────────────────────────────

export const checkinRuleContract = defineContract('/api/checkin-rules', {
  list: op.get('/', { access: { permission: 'member:checkin:rule:list' }, response: z.array(checkinRuleSchema), summary: '签到规则列表' }),
  create: op.post('/', { access: { permission: 'member:checkin:rule:create' }, audit: '创建签到规则', body: createCheckinRuleSchema, response: checkinRuleSchema, summary: '创建签到规则' }),
  update: op.put('/{id}', { access: { permission: 'member:checkin:rule:update' }, audit: '更新签到规则', params: idParam, body: updateCheckinRuleSchema, response: checkinRuleSchema, summary: '更新签到规则' }),
  remove: op.delete('/{id}', { access: { permission: 'member:checkin:rule:delete' }, audit: '删除签到规则', params: idParam, summary: '删除签到规则' }),
}, { auditModule: '会员签到', tags: ['会员签到'] });
