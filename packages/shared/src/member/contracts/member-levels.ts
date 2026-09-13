import * as z from 'zod';
import { entityStatusSchema, idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createMemberLevelSchema, updateMemberLevelSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const memberLevelSchema = z.object({
  id: z.int(),
  name: z.string(),
  level: z.int(),
  growthThreshold: z.int(),
  discount: z.int().meta({ description: '折扣百分比（100 = 原价，95 = 95 折）' }),
  icon: z.string().nullable(),
  benefits: z.array(z.string()),
  description: z.string().nullable(),
  sort: z.int(),
  status: entityStatusSchema,
  memberCount: z.int().optional().meta({ description: '该等级会员数（后台列表附加）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MemberLevel' });

export type MemberLevel = z.infer<typeof memberLevelSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const memberLevelContract = defineContract('/api/member-levels', {
  list: op.get('/', { access: { permission: 'member:level:list' }, response: z.array(memberLevelSchema), summary: '会员等级列表' }),
  detail: op.get('/{id}', { access: { permission: 'member:level:list' }, params: idParam, response: memberLevelSchema, summary: '等级详情' }),
  create: op.post('/', { access: { permission: 'member:level:create' }, audit: '创建会员等级', body: createMemberLevelSchema, response: memberLevelSchema, summary: '创建等级' }),
  update: op.put('/{id}', { access: { permission: 'member:level:update' }, audit: '更新会员等级', params: idParam, body: updateMemberLevelSchema, response: memberLevelSchema, summary: '更新等级' }),
  remove: op.delete('/{id}', { access: { permission: 'member:level:delete' }, audit: '删除会员等级', params: idParam, summary: '删除等级' }),
}, { auditModule: '会员等级', tags: ['会员等级'] });
