import * as z from 'zod';
import { auditFieldsSchema, dateRangeQuery, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { DATA_SCOPES, ACCESS_APPROVAL_POLICIES, ACCESS_GRANT_STATUSES, ACCESS_REQUEST_ITEM_TYPES, ACCESS_REQUEST_STATUSES, ACCESS_REQUEST_TYPES, ACCESS_REVIEW_DECISIONS, ACCESS_REVIEW_SCOPE_TYPES, ACCESS_REVIEW_STATUSES, ACCESS_REVIEW_SOURCE_TYPES, ACCESS_RISK_LEVELS } from '../constants';
import { createAccessRequestSchema, createAccessReviewCampaignSchema, decideAccessReviewItemSchema, revokeAccessGrantSchema, updatePermissionPolicySchema } from '../validation';

export const permissionPolicySchema = z.object({
  id: z.int(),
  permissionCode: z.string(),
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  approvalPolicy: z.enum(ACCESS_APPROVAL_POLICIES),
  maxDurationMinutes: z.int().nullable().optional(),
  reviewIntervalDays: z.int(),
  mfaRequired: z.boolean(),
  enabled: z.boolean(),
  tenantId: z.int().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'IdentityPermissionPolicy' });

export type PermissionPolicy = z.infer<typeof permissionPolicySchema>;

export const accessRequestItemSchema = z.object({
  id: z.int(),
  itemType: z.enum(ACCESS_REQUEST_ITEM_TYPES),
  roleId: z.int().nullable().optional(),
  menuId: z.int().nullable().optional(),
  permissionCode: z.string().nullable().optional(),
  permissionLabel: z.string().nullable().optional(),
  dataScope: z.enum(DATA_SCOPES).nullable().optional(),
  deptScopeIds: z.array(z.int()),
  snapshot: z.record(z.string(), z.unknown()),
}).meta({ id: 'IdentityAccessRequestItem' });

export const accessRequestSchema = z.object({
  id: z.int(),
  tenantId: z.int().nullable().optional(),
  applicantUserId: z.int(),
  applicantName: z.string().nullable().optional(),
  targetUserId: z.int(),
  targetUserName: z.string().nullable().optional(),
  requestType: z.enum(ACCESS_REQUEST_TYPES),
  status: z.enum(ACCESS_REQUEST_STATUSES),
  reason: z.string(),
  businessReference: z.string().nullable().optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  workflowInstanceId: z.int().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  items: z.array(accessRequestItemSchema),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'IdentityAccessRequest' });

export type AccessRequest = z.infer<typeof accessRequestSchema>;

export const accessGrantSchema = z.object({
  id: z.int(),
  tenantId: z.int().nullable().optional(),
  userId: z.int(),
  userName: z.string().nullable().optional(),
  requestId: z.int().nullable().optional(),
  sourceType: z.enum(['request', 'emergency', 'admin']),
  status: z.enum(ACCESS_GRANT_STATUSES),
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  dataScope: z.enum(DATA_SCOPES).nullable().optional(),
  deptScopeIds: z.array(z.int()),
  startsAt: z.string(),
  expiresAt: z.string(),
  approvedBy: z.int().nullable().optional(),
  approvedByName: z.string().nullable().optional(),
  revokedBy: z.int().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  revokeReason: z.string().nullable().optional(),
  menus: z.array(z.object({ menuId: z.int(), permissionCode: z.string().nullable(), permissionLabel: z.string().nullable() })),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'IdentityAccessGrant' });

export type AccessGrant = z.infer<typeof accessGrantSchema>;

export const accessReviewCampaignSchema = z.object({
  id: z.int(),
  tenantId: z.int().nullable().optional(),
  name: z.string(),
  scopeType: z.enum(ACCESS_REVIEW_SCOPE_TYPES),
  reviewerId: z.int(),
  reviewerName: z.string().nullable().optional(),
  dueAt: z.string(),
  status: z.enum(ACCESS_REVIEW_STATUSES),
  itemCount: z.int().optional(),
  pendingCount: z.int().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'IdentityAccessReviewCampaign' });

export type AccessReviewCampaign = z.infer<typeof accessReviewCampaignSchema>;

export const accessReviewItemSchema = z.object({
  id: z.int(),
  campaignId: z.int(),
  tenantId: z.int().nullable().optional(),
  userId: z.int(),
  userName: z.string().nullable().optional(),
  sourceType: z.enum(ACCESS_REVIEW_SOURCE_TYPES),
  sourceId: z.int().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  permissionCode: z.string().nullable().optional(),
  permissionLabel: z.string().nullable().optional(),
  riskLevel: z.enum(ACCESS_RISK_LEVELS),
  decision: z.enum(ACCESS_REVIEW_DECISIONS),
  decidedBy: z.int().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
}).meta({ id: 'IdentityAccessReviewItem' });

export type AccessReviewItem = z.infer<typeof accessReviewItemSchema>;

const requestListQuery = paginationQuery.extend({
  keyword: keywordQuery('申请原因 / 业务编号'),
  status: queryEnum(ACCESS_REQUEST_STATUSES, { description: '申请状态' }),
  riskLevel: queryEnum(ACCESS_RISK_LEVELS, { description: '风险等级' }),
  targetUserId: idQuery('目标用户'),
  ...dateRangeQuery('申请时间'),
});

const grantListQuery = paginationQuery.extend({
  keyword: keywordQuery('权限码 / 用户'),
  status: queryEnum(ACCESS_GRANT_STATUSES, { description: '授权状态' }),
  riskLevel: queryEnum(ACCESS_RISK_LEVELS, { description: '风险等级' }),
  userId: idQuery('用户'),
});

const reviewListQuery = paginationQuery.extend({
  decision: queryEnum(ACCESS_REVIEW_DECISIONS, { description: '复核结果' }),
  riskLevel: queryEnum(ACCESS_RISK_LEVELS, { description: '风险等级' }),
  sourceType: queryEnum(ACCESS_REVIEW_SOURCE_TYPES, { description: '授权来源' }),
  userId: idQuery('用户'),
});

export const accessGovernanceContract = defineContract('/api/access-governance', {
  requestList: op.get('/requests', { access: { permission: 'system:access-governance:view' }, query: requestListQuery, response: paginated(accessRequestSchema), summary: '权限申请列表' }),
  requestMine: op.get('/requests/mine', { access: 'authenticated', query: requestListQuery, response: paginated(accessRequestSchema), summary: '我的权限申请' }),
  requestDetail: op.get('/requests/{id}', { access: 'authenticated', params: idParam, response: accessRequestSchema, summary: '权限申请详情' }),
  requestCreate: op.post('/requests', { access: 'authenticated', body: createAccessRequestSchema, response: accessRequestSchema, summary: '创建权限申请', audit: '创建权限申请' }),
  requestSubmit: op.post('/requests/{id}/submit', { access: 'authenticated', params: idParam, response: accessRequestSchema, summary: '提交权限申请', audit: '提交权限申请' }),
  requestCancel: op.post('/requests/{id}/cancel', { access: 'authenticated', params: idParam, response: accessRequestSchema, summary: '取消权限申请', audit: '取消权限申请' }),
  grantList: op.get('/grants', { access: { permission: 'system:access-governance:view' }, query: grantListQuery, response: paginated(accessGrantSchema), summary: '临时授权列表' }),
  grantRevoke: op.post('/grants/{id}/revoke', { access: { permission: 'system:access-governance:revoke' }, params: idParam, body: revokeAccessGrantSchema, response: accessGrantSchema, summary: '撤销临时授权', audit: '撤销临时授权' }),
  reviewCampaignList: op.get('/review-campaigns', { access: { permission: 'system:access-governance:review' }, query: paginationQuery, response: paginated(accessReviewCampaignSchema), summary: '权限复核批次列表' }),
  reviewCampaignCreate: op.post('/review-campaigns', { access: { permission: 'system:access-governance:review' }, body: createAccessReviewCampaignSchema, response: accessReviewCampaignSchema, summary: '创建权限复核批次', audit: '创建权限复核批次' }),
  reviewItemList: op.get('/review-items', { access: { permission: 'system:access-governance:review' }, query: reviewListQuery, response: paginated(accessReviewItemSchema), summary: '权限复核项列表' }),
  reviewItemDecide: op.post('/review-items/{id}/decide', { access: { permission: 'system:access-governance:review' }, params: idParam, body: decideAccessReviewItemSchema, response: accessReviewItemSchema, summary: '处理权限复核项', audit: '处理权限复核项' }),
  policyList: op.get('/policies', { access: { permission: 'system:access-governance:policy' }, query: paginationQuery.extend({ keyword: keywordQuery('权限码'), riskLevel: queryEnum(ACCESS_RISK_LEVELS, { description: '风险等级' }), approvalPolicy: queryEnum(ACCESS_APPROVAL_POLICIES, { description: '审批策略' }) }), response: paginated(permissionPolicySchema), summary: '权限治理策略列表' }),
  policyUpdate: op.put('/policies/{permissionCode}', { access: { permission: 'system:access-governance:policy' }, params: z.object({ permissionCode: z.string().min(1).max(128) }), body: updatePermissionPolicySchema, response: permissionPolicySchema, summary: '更新权限治理策略', audit: '更新权限治理策略' }),
  userOverview: op.get('/users/{id}/overview', { access: { permission: 'system:access-governance:view' }, params: idParam, response: z.object({ userId: z.int(), grants: z.array(accessGrantSchema), reviews: z.array(accessReviewItemSchema) }), summary: '用户权限治理概览' }),
}, { auditModule: '权限治理', tags: ['AccessGovernance'] });

export type AccessRequestListQuery = z.infer<typeof requestListQuery>;
export type AccessGrantListQuery = z.infer<typeof grantListQuery>;
export type AccessReviewItemListQuery = z.infer<typeof reviewListQuery>;
