import { pgEnum, pgTable, integer, varchar, boolean, jsonb, index, unique, primaryKey } from 'drizzle-orm/pg-core';
import { ACCESS_APPROVAL_POLICIES, ACCESS_GRANT_SOURCES, ACCESS_GRANT_STATUSES, ACCESS_REQUEST_ITEM_TYPES, ACCESS_REQUEST_STATUSES, ACCESS_REQUEST_TYPES, ACCESS_REVIEW_DECISIONS, ACCESS_REVIEW_SCOPE_TYPES, ACCESS_REVIEW_STATUSES, ACCESS_REVIEW_SOURCE_TYPES, ACCESS_RISK_LEVELS } from '@zenith/shared/identity';
import { auditColumns, dataScopeEnum, menus, roles, tenantIdColumn, users } from './core';
import { idColumn, timestamptz, timestampColumns } from './common';
import { workflowInstances } from './workflow';

export const accessRiskLevelEnum = pgEnum('identity_access_risk_level', ACCESS_RISK_LEVELS);
export const accessApprovalPolicyEnum = pgEnum('identity_access_approval_policy', ACCESS_APPROVAL_POLICIES);
export const accessRequestTypeEnum = pgEnum('identity_access_request_type', ACCESS_REQUEST_TYPES);
export const accessRequestStatusEnum = pgEnum('identity_access_request_status', ACCESS_REQUEST_STATUSES);
export const accessRequestItemTypeEnum = pgEnum('identity_access_request_item_type', ACCESS_REQUEST_ITEM_TYPES);
export const accessGrantStatusEnum = pgEnum('identity_access_grant_status', ACCESS_GRANT_STATUSES);
export const accessGrantSourceEnum = pgEnum('identity_access_grant_source', ACCESS_GRANT_SOURCES);
export const accessReviewScopeTypeEnum = pgEnum('identity_access_review_scope_type', ACCESS_REVIEW_SCOPE_TYPES);
export const accessReviewStatusEnum = pgEnum('identity_access_review_status', ACCESS_REVIEW_STATUSES);
export const accessReviewDecisionEnum = pgEnum('identity_access_review_decision', ACCESS_REVIEW_DECISIONS);
export const accessReviewSourceTypeEnum = pgEnum('identity_access_review_source_type', ACCESS_REVIEW_SOURCE_TYPES);

export const identityPermissionPolicies = pgTable('identity_permission_policies', {
  id: idColumn(),
  permissionCode: varchar({ length: 128 }).notNull(),
  riskLevel: accessRiskLevelEnum().notNull().default('low'),
  approvalPolicy: accessApprovalPolicyEnum().notNull().default('none'),
  maxDurationMinutes: integer(),
  reviewIntervalDays: integer().notNull().default(0),
  mfaRequired: boolean().notNull().default(false),
  enabled: boolean().notNull().default(true),
  tenantId: tenantIdColumn(),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [
  unique('identity_permission_policies_code_tenant_unique').on(t.permissionCode, t.tenantId).nullsNotDistinct(),
  index('identity_permission_policies_tenant_idx').on(t.tenantId),
  index('identity_permission_policies_risk_idx').on(t.riskLevel),
]);

export type IdentityPermissionPolicyRow = typeof identityPermissionPolicies.$inferSelect;
export type NewIdentityPermissionPolicy = typeof identityPermissionPolicies.$inferInsert;

export const identityAccessRequests = pgTable('identity_access_requests', {
  id: idColumn(),
  tenantId: tenantIdColumn(),
  applicantUserId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestType: accessRequestTypeEnum().notNull().default('temporary'),
  status: accessRequestStatusEnum().notNull().default('draft'),
  reason: varchar({ length: 1000 }).notNull(),
  businessReference: varchar({ length: 128 }),
  startsAt: timestamptz().notNull(),
  expiresAt: timestamptz().notNull(),
  riskLevel: accessRiskLevelEnum().notNull().default('low'),
  workflowInstanceId: integer().references(() => workflowInstances.id, { onDelete: 'set null' }),
  approvedAt: timestamptz(),
  rejectedAt: timestamptz(),
  appliedAt: timestamptz(),
  failureReason: varchar({ length: 1000 }),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [
  index('identity_access_requests_tenant_created_idx').on(t.tenantId, t.createdAt.desc(), t.id.desc()),
  index('identity_access_requests_applicant_idx').on(t.applicantUserId, t.createdAt.desc()),
  index('identity_access_requests_target_idx').on(t.targetUserId, t.createdAt.desc()),
  index('identity_access_requests_status_idx').on(t.status, t.createdAt.desc()),
  index('identity_access_requests_workflow_idx').on(t.workflowInstanceId),
]);

export type IdentityAccessRequestRow = typeof identityAccessRequests.$inferSelect;
export type NewIdentityAccessRequest = typeof identityAccessRequests.$inferInsert;

export const identityAccessRequestItems = pgTable('identity_access_request_items', {
  id: idColumn(),
  requestId: integer().notNull().references(() => identityAccessRequests.id, { onDelete: 'cascade' }),
  itemType: accessRequestItemTypeEnum().notNull(),
  roleId: integer().references(() => roles.id, { onDelete: 'set null' }),
  menuId: integer().references(() => menus.id, { onDelete: 'set null' }),
  permissionCode: varchar({ length: 128 }),
  permissionLabel: varchar({ length: 128 }),
  dataScope: dataScopeEnum(),
  deptScopeIds: jsonb().$type<number[]>().notNull().default([]),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamptz().defaultNow().notNull(),
}, (t) => [
  index('identity_access_request_items_request_idx').on(t.requestId),
  index('identity_access_request_items_role_idx').on(t.roleId),
  index('identity_access_request_items_menu_idx').on(t.menuId),
]);

export type IdentityAccessRequestItemRow = typeof identityAccessRequestItems.$inferSelect;
export type NewIdentityAccessRequestItem = typeof identityAccessRequestItems.$inferInsert;

export const identityAccessGrants = pgTable('identity_access_grants', {
  id: idColumn(),
  tenantId: tenantIdColumn(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestId: integer().references(() => identityAccessRequests.id, { onDelete: 'set null' }),
  sourceType: accessGrantSourceEnum().notNull().default('request'),
  sourceRoleId: integer().references(() => roles.id, { onDelete: 'set null' }),
  status: accessGrantStatusEnum().notNull().default('scheduled'),
  riskLevel: accessRiskLevelEnum().notNull().default('low'),
  dataScope: dataScopeEnum(),
  deptScopeIds: jsonb().$type<number[]>().notNull().default([]),
  startsAt: timestamptz().notNull(),
  expiresAt: timestamptz().notNull(),
  approvedBy: integer().references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamptz(),
  revokedBy: integer().references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamptz(),
  revokeReason: varchar({ length: 1000 }),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [
  index('identity_access_grants_tenant_status_idx').on(t.tenantId, t.status, t.expiresAt),
  index('identity_access_grants_user_status_idx').on(t.userId, t.status, t.startsAt, t.expiresAt),
  index('identity_access_grants_request_idx').on(t.requestId),
  index('identity_access_grants_expiry_idx').on(t.status, t.expiresAt),
]);

export type IdentityAccessGrantRow = typeof identityAccessGrants.$inferSelect;
export type NewIdentityAccessGrant = typeof identityAccessGrants.$inferInsert;

export const identityAccessGrantMenus = pgTable('identity_access_grant_menus', {
  grantId: integer().notNull().references(() => identityAccessGrants.id, { onDelete: 'cascade' }),
  menuId: integer().notNull().references(() => menus.id, { onDelete: 'restrict' }),
  permissionCode: varchar({ length: 128 }),
  permissionLabel: varchar({ length: 128 }),
}, (t) => [
  primaryKey({ columns: [t.grantId, t.menuId] }),
  index('identity_access_grant_menus_menu_idx').on(t.menuId),
]);

export type IdentityAccessGrantMenuRow = typeof identityAccessGrantMenus.$inferSelect;
export type NewIdentityAccessGrantMenu = typeof identityAccessGrantMenus.$inferInsert;

export const identityAccessReviewCampaigns = pgTable('identity_access_review_campaigns', {
  id: idColumn(),
  tenantId: tenantIdColumn(),
  name: varchar({ length: 128 }).notNull(),
  scopeType: accessReviewScopeTypeEnum().notNull(),
  reviewerId: integer().notNull().references(() => users.id, { onDelete: 'restrict' }),
  dueAt: timestamptz().notNull(),
  status: accessReviewStatusEnum().notNull().default('open'),
  startedAt: timestamptz().defaultNow().notNull(),
  completedAt: timestamptz(),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [
  index('identity_access_review_campaigns_tenant_status_idx').on(t.tenantId, t.status, t.dueAt),
  index('identity_access_review_campaigns_reviewer_idx').on(t.reviewerId, t.status),
]);

export type IdentityAccessReviewCampaignRow = typeof identityAccessReviewCampaigns.$inferSelect;
export type NewIdentityAccessReviewCampaign = typeof identityAccessReviewCampaigns.$inferInsert;

export const identityAccessReviewItems = pgTable('identity_access_review_items', {
  id: idColumn(),
  campaignId: integer().notNull().references(() => identityAccessReviewCampaigns.id, { onDelete: 'cascade' }),
  tenantId: tenantIdColumn(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceType: accessReviewSourceTypeEnum().notNull(),
  sourceId: integer(),
  sourceLabel: varchar({ length: 128 }),
  permissionCode: varchar({ length: 128 }),
  permissionLabel: varchar({ length: 128 }),
  riskLevel: accessRiskLevelEnum().notNull().default('low'),
  decision: accessReviewDecisionEnum().notNull().default('pending'),
  decidedBy: integer().references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamptz(),
  remark: varchar({ length: 1000 }),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamptz().defaultNow().notNull(),
  updatedAt: timestamptz().defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('identity_access_review_items_campaign_idx').on(t.campaignId, t.decision),
  index('identity_access_review_items_tenant_user_idx').on(t.tenantId, t.userId),
  index('identity_access_review_items_risk_idx').on(t.riskLevel, t.decision),
]);

export type IdentityAccessReviewItemRow = typeof identityAccessReviewItems.$inferSelect;
export type NewIdentityAccessReviewItem = typeof identityAccessReviewItems.$inferInsert;
