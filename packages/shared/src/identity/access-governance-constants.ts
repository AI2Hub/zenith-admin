/**
 * 权限治理枚举：独立成模块，避免随 `./constants` 进入会员端关键路径。
 *
 * `@zenith/shared/member` 的 contracts/members.ts 会运行时引用 `./constants` 的 LOGIN_STATUSES，
 * 该模块被整体保留；治理枚举若与其同模块，就会一并进入 member 入口的关键路径。
 */
export const ACCESS_REQUEST_BIZ_TYPE = 'identity.access_request' as const;

export const ACCESS_RISK_LEVELS = ['low', 'high', 'critical'] as const;
export type AccessRiskLevel = (typeof ACCESS_RISK_LEVELS)[number];

export const ACCESS_APPROVAL_POLICIES = ['none', 'manager', 'manager_security', 'two_person'] as const;
export type AccessApprovalPolicy = (typeof ACCESS_APPROVAL_POLICIES)[number];

export const ACCESS_APPROVAL_POLICY_LABELS: Record<AccessApprovalPolicy, string> = {
  none: '策略自动批准', manager: '部门负责人', manager_security: '部门负责人 + 安全审批', two_person: '部门负责人 + 两名独立安全审批',
};
export const ACCESS_APPROVAL_NODE_KEYS = ['approve_manager', 'approve_security', 'approve_second_security'] as const;
export const ACCESS_START_MODES = ['immediate', 'scheduled'] as const;

export const ACCESS_REQUEST_TYPES = ['temporary', 'emergency'] as const;
export type AccessRequestType = (typeof ACCESS_REQUEST_TYPES)[number];

export const ACCESS_REQUEST_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'applied', 'failed'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const ACCESS_REQUEST_ITEM_TYPES = ['role', 'menu'] as const;
export type AccessRequestItemType = (typeof ACCESS_REQUEST_ITEM_TYPES)[number];

export const ACCESS_GRANT_STATUSES = ['scheduled', 'active', 'expired', 'revoked'] as const;
export type AccessGrantStatus = (typeof ACCESS_GRANT_STATUSES)[number];

export const ACCESS_GRANT_SOURCES = ['request', 'emergency', 'admin'] as const;
export type AccessGrantSource = (typeof ACCESS_GRANT_SOURCES)[number];

export const ACCESS_REVIEW_SCOPE_TYPES = ['tenant', 'department', 'role', 'group', 'high_risk', 'temporary'] as const;
export type AccessReviewScopeType = (typeof ACCESS_REVIEW_SCOPE_TYPES)[number];

export const ACCESS_REVIEW_STATUSES = ['open', 'in_progress', 'completed', 'overdue'] as const;
export type AccessReviewStatus = (typeof ACCESS_REVIEW_STATUSES)[number];

export const ACCESS_REVIEW_DECISIONS = ['pending', 'keep', 'revoke', 'extend', 'exception', 'escalate'] as const;
export type AccessReviewDecision = (typeof ACCESS_REVIEW_DECISIONS)[number];

export const ACCESS_REVIEW_SOURCE_TYPES = ['role', 'group_role', 'direct_menu', 'temporary_grant'] as const;
export type AccessReviewSourceType = (typeof ACCESS_REVIEW_SOURCE_TYPES)[number];
