import * as z from 'zod';
import { entityStatusSchema, idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { saveMemberTagSchema, updateMemberTagSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 会员标签（运营分群） */
export const memberTagSchema = z.object({
  id: z.int(),
  name: z.string(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  sort: z.int(),
  status: entityStatusSchema,
  memberCount: z.int().optional().meta({ description: '绑定会员数（列表附加）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MemberTag' });

export type MemberTag = z.infer<typeof memberTagSchema>;

/** 会员身上的标签摘要 */
export const memberTagBriefSchema = z.object({
  id: z.int(),
  name: z.string(),
  color: z.string().nullable(),
}).meta({ id: 'MemberTagBrief' });

export type MemberTagBrief = z.infer<typeof memberTagBriefSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const memberTagContract = defineContract('/api/member-tags', {
  list: op.get('/', { access: { permission: 'member:member:list' }, response: z.array(memberTagSchema), summary: '会员标签列表' }),
  create: op.post('/', { access: { permission: 'member:member:update' }, audit: '创建会员标签', body: saveMemberTagSchema, response: memberTagSchema, summary: '创建会员标签' }),
  update: op.put('/{id}', { access: { permission: 'member:member:update' }, audit: '更新会员标签', params: idParam, body: updateMemberTagSchema, response: memberTagSchema, summary: '更新会员标签' }),
  remove: op.delete('/{id}', { access: { permission: 'member:member:update' }, audit: '删除会员标签', params: idParam, summary: '删除会员标签' }),
}, { auditModule: '会员标签', tags: ['会员标签'] });
