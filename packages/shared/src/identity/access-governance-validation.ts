import * as z from 'zod';
import { dateTimeStringSchema } from '../core/validation';
import {
  ACCESS_APPROVAL_POLICIES,
  ACCESS_REQUEST_TYPES,
  ACCESS_REVIEW_SCOPE_TYPES,
  ACCESS_RISK_LEVELS,
} from './access-governance-constants';

// ─── 权限治理 Schema ──────────────────────────────────────────────────────────
// 独立于 ./validation：后者被 member 入口的认证契约整段保留（模块顶层 schema 都会求值），
// 治理 schema 与其同模块会随会员端关键路径一起下发。

export const accessWorkflowInputSchema = z.object({
  requestType: z.enum(ACCESS_REQUEST_TYPES).default('temporary'),
  roleIds: z.array(z.number().int().positive()).default([]),
  menuIds: z.array(z.number().int().positive()).default([]),
  reason: z.string().trim().min(5, '申请原因至少 5 个字').max(1000),
  businessReference: z.string().trim().max(128).optional(),
  startsAt: dateTimeStringSchema,
  expiresAt: dateTimeStringSchema,
}).superRefine((value, ctx) => {
  if (value.roleIds.length === 0 && value.menuIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['roleIds'], message: '至少申请一项角色或菜单权限' });
  }
});

export const revokeAccessGrantSchema = z.object({
  reason: z.string().trim().min(2, '撤销原因不能为空').max(1000),
});

export const createAccessReviewCampaignSchema = z.object({
  name: z.string().trim().min(1, '复核批次名称不能为空').max(128),
  scopeType: z.enum(ACCESS_REVIEW_SCOPE_TYPES),
  reviewerId: z.number().int().positive(),
  dueAt: dateTimeStringSchema,
});

export const decideAccessReviewItemSchema = z.object({
  decision: z.enum(['keep', 'revoke', 'extend', 'exception', 'escalate'] as const),
  remark: z.string().trim().max(1000).optional(),
});

export const updatePermissionPolicySchema = z.object({
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  approvalPolicy: z.enum(ACCESS_APPROVAL_POLICIES),
  maxDurationMinutes: z.number().int().positive().nullable().optional(),
  reviewIntervalDays: z.number().int().min(0).max(3650),
  mfaRequired: z.boolean(),
  enabled: z.boolean(),
});

export type AccessWorkflowInput = z.infer<typeof accessWorkflowInputSchema>;
export type RevokeAccessGrantInput = z.infer<typeof revokeAccessGrantSchema>;
export type CreateAccessReviewCampaignInput = z.infer<typeof createAccessReviewCampaignSchema>;
export type DecideAccessReviewItemInput = z.infer<typeof decideAccessReviewItemSchema>;
export type UpdatePermissionPolicyInput = z.infer<typeof updatePermissionPolicySchema>;
