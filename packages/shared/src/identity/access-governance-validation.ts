import * as z from 'zod';
import { dateTimeStringSchema } from '../core/validation';
import {
  ACCESS_APPROVAL_POLICIES,
  ACCESS_APPROVAL_NODE_KEYS,
  ACCESS_START_MODES,
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
  startMode: z.enum(ACCESS_START_MODES).default('immediate'),
  startsAt: dateTimeStringSchema.optional(),
  expiresAt: dateTimeStringSchema,
}).superRefine((value, ctx) => {
  if (value.startMode === 'scheduled' && !value.startsAt) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: '预约生效必须填写生效时间' });
  if (value.roleIds.length === 0 && value.menuIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['roleIds'], message: '至少申请一项角色或菜单权限' });
  }
});

export const accessPolicySnapshotSchema = z.object({
  permissionCode: z.string(),
  policyId: z.int().nullable(),
  version: z.int(),
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  approvalPolicy: z.enum(ACCESS_APPROVAL_POLICIES),
  maxDurationMinutes: z.int().positive(),
  reviewIntervalDays: z.int(),
  mfaRequired: z.boolean(),
  enabled: z.boolean(),
});
export type AccessPolicySnapshot = z.infer<typeof accessPolicySnapshotSchema>;

export const accessApprovalPlanSchema = z.object({
  approvalPolicy: z.enum(ACCESS_APPROVAL_POLICIES),
  mfaRequired: z.boolean(),
  steps: z.array(z.object({ nodeKey: z.enum(ACCESS_APPROVAL_NODE_KEYS), label: z.string(), userId: z.int(), userName: z.string(), reason: z.string() })),
});
export type AccessApprovalPlan = z.infer<typeof accessApprovalPlanSchema>;

export const accessApprovalEvidenceSchema = z.object({
  taskId: z.int(), nodeKey: z.enum(ACCESS_APPROVAL_NODE_KEYS), actorId: z.int(), approvedAt: dateTimeStringSchema,
  mfaVerifiedAt: dateTimeStringSchema.nullable(),
});
export type AccessApprovalEvidence = z.infer<typeof accessApprovalEvidenceSchema>;

export const revokeAccessGrantSchema = z.object({
  reason: z.string().trim().min(2, '撤销原因不能为空').max(1000),
});

export const createAccessReviewCampaignSchema = z.object({
  name: z.string().trim().min(1, '复核批次名称不能为空').max(128),
  scopeType: z.enum(ACCESS_REVIEW_SCOPE_TYPES),
  scopeIds: z.array(z.number().int().positive()).max(1000).default([]),
  reviewerId: z.number().int().positive(),
  dueAt: dateTimeStringSchema,
}).superRefine((value, ctx) => {
  if (['department', 'role', 'group', 'user'].includes(value.scopeType) && value.scopeIds.length === 0) ctx.addIssue({ code: 'custom', path: ['scopeIds'], message: '请选择要复核的具体范围' });
});

export const assignAccessReviewCampaignSchema = z.object({ reviewerId: z.number().int().positive(), reason: z.string().trim().min(2).max(1000) });
export type AssignAccessReviewCampaignInput = z.infer<typeof assignAccessReviewCampaignSchema>;

export const decideAccessReviewItemSchema = z.object({
  decision: z.enum(['keep', 'revoke', 'extend', 'exception', 'escalate'] as const),
  remark: z.string().trim().min(2, '请填写处置依据').max(1000),
  expiresAt: dateTimeStringSchema.optional(),
  targetReviewerId: z.number().int().positive().optional(),
  exceptionOwnerId: z.number().int().positive().optional(),
  dueAt: dateTimeStringSchema.optional(),
  mfaCode: z.string().trim().regex(/^\d{6}$/, '请输入六位动态验证码').optional(),
}).superRefine((value, ctx) => {
  if (['extend', 'exception'].includes(value.decision) && !value.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: '请填写新的截止时间' });
  if (value.decision === 'exception' && !value.exceptionOwnerId) ctx.addIssue({ code: 'custom', path: ['exceptionOwnerId'], message: '请选择例外责任人' });
  if (value.decision === 'escalate' && (!value.targetReviewerId || !value.dueAt)) ctx.addIssue({ code: 'custom', path: ['targetReviewerId'], message: '升级处理必须指定新负责人和截止时间' });
});

export const accessReviewHistorySchema = z.object({
  decision: z.enum(['keep', 'revoke', 'extend', 'exception', 'escalate']),
  actorId: z.int(), actorName: z.string(), decidedAt: dateTimeStringSchema, remark: z.string(),
  targetReviewerId: z.int().nullable(), expiresAt: dateTimeStringSchema.nullable(),
  mfaVerifiedAt: dateTimeStringSchema.nullable(), policies: z.array(accessPolicySnapshotSchema),
});
export type AccessReviewHistory = z.infer<typeof accessReviewHistorySchema>;

export const updatePermissionPolicySchema = z.object({
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  approvalPolicy: z.enum(ACCESS_APPROVAL_POLICIES),
  maxDurationMinutes: z.number().int().positive().nullable(),
  reviewIntervalDays: z.number().int().min(0).max(3650),
  mfaRequired: z.boolean(),
  enabled: z.boolean(),
});

export type AccessWorkflowInput = z.infer<typeof accessWorkflowInputSchema>;
export type RevokeAccessGrantInput = z.infer<typeof revokeAccessGrantSchema>;
export type CreateAccessReviewCampaignInput = z.infer<typeof createAccessReviewCampaignSchema>;
export type DecideAccessReviewItemInput = z.infer<typeof decideAccessReviewItemSchema>;
export type UpdatePermissionPolicyInput = z.infer<typeof updatePermissionPolicySchema>;
