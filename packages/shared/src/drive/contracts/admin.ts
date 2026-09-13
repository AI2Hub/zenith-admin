import * as z from 'zod';
import { dateRangeQuery, entityStatusSchema, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryBool, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { asyncTaskSchema } from '../../tasks/contracts';
import { DRIVE_ACTIVITY_ACTIONS, DRIVE_NODE_TYPES, DRIVE_QUOTA_REQUEST_STATUSES, DRIVE_ROLES, DRIVE_SPACE_TYPES } from '../constants';
import {
  adminUpdateDriveSpaceSchema, createDepartmentDriveSpaceSchema, createDriveLegalHoldSchema, createDriveOpenAppGrantSchema, decideDriveQuotaRequestSchema,
  driveAdminTaskScopeSchema, handoffDriveSpaceSchema, releaseDriveLegalHoldSchema,
} from '../validation';
import { driveActivitySchema } from './nodes';
import { driveShareAccessLogSchema, driveShareLinkListQuery, driveShareLinkSchema } from './share-links';
import { driveQuotaRequestSchema, driveSpaceListQuery, driveSpaceSchema } from './spaces';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const driveOpenAppGrantSchema = z.object({
  id: z.int(),
  clientId: z.string(),
  appName: z.string().nullable(),
  spaceId: z.int(),
  spaceName: z.string(),
  role: z.enum(DRIVE_ROLES),
  status: entityStatusSchema,
  remark: z.string().nullable(),
  createdAt: z.string(),
}).meta({ id: 'DriveOpenAppGrant' });

export type DriveOpenAppGrant = z.infer<typeof driveOpenAppGrantSchema>;

export const driveLegalHoldSchema = z.object({
  id: z.int(),
  nodeId: z.int(),
  nodeName: z.string(),
  nodeType: z.enum(DRIVE_NODE_TYPES),
  spaceId: z.int(),
  spaceName: z.string(),
  reason: z.string(),
  active: z.boolean(),
  createdBy: z.int().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  releasedBy: z.int().nullable(),
  releasedByName: z.string().nullable(),
  releasedAt: z.string().nullable(),
  releaseNote: z.string().nullable(),
}).meta({ id: 'DriveLegalHold' });

export type DriveLegalHold = z.infer<typeof driveLegalHoldSchema>;

export const driveAdminStatsSchema = z.object({
  spaceCount: z.int(),
  spaceCountByType: z.object({ personal: z.int(), department: z.int(), team: z.int() }),
  fileCount: z.int(),
  folderCount: z.int(),
  totalBytes: z.int(),
  recycleBytes: z.int(),
  versionBytes: z.int(),
  activeShareLinks: z.int(),
  todayUploads: z.int(),
  todayDownloads: z.int(),
  topSpaces: z.array(z.object({ id: z.int(), name: z.string(), type: z.enum(DRIVE_SPACE_TYPES), usedBytes: z.int(), quotaBytes: z.int() })),
  typeDistribution: z.array(z.object({ category: z.string(), count: z.int(), bytes: z.int() })),
  dailyTrend: z.array(z.object({ date: z.string(), uploads: z.int(), downloads: z.int() })),
}).meta({ id: 'DriveAdminStats' });

export type DriveAdminStats = z.infer<typeof driveAdminStatsSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const driveAdminSpaceListQuery = driveSpaceListQuery.extend({
  departmentId: idQuery(),
  ownerId: idQuery(),
  orphaned: queryBool('只显示待接管空间'),
});

export const driveAdminShareLinkListQuery = driveShareLinkListQuery.extend({
  createdBy: z.coerce.number().int().positive().optional(),
});

export const driveAdminActivityListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  spaceId: idQuery(),
  actorId: idQuery(),
  action: queryEnum(DRIVE_ACTIVITY_ACTIONS),
  ...dateRangeQuery('时间'),
});

export const driveAdminShareLogListQuery = paginationQuery.extend({
  shareId: idQuery(),
  spaceId: idQuery(),
  action: z.string().max(16).optional(),
  ok: queryBool('只看通过 / 只看被拒绝'),
  ...dateRangeQuery('时间'),
});

export const driveLegalHoldListQuery = paginationQuery.extend({
  spaceId: idQuery(),
  nodeId: idQuery(),
  active: queryBool('只显示生效中的保留'),
});

export const driveQuotaRequestListQuery = paginationQuery.extend({
  status: queryEnum(DRIVE_QUOTA_REQUEST_STATUSES),
  spaceId: idQuery(),
});

export const driveOpenAppGrantListQuery = z.object({
  spaceId: idQuery(),
  clientId: z.string().max(64).optional(),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const driveAdminContract = defineContract('/api/drive/admin', {
  stats: op.get('/stats', { access: { permission: 'drive:admin:stats:view' }, response: driveAdminStatsSchema, summary: '网盘统计概览' }),
  spaces: op.get('/spaces', { access: { permission: 'drive:admin:space:list' }, query: driveAdminSpaceListQuery, response: paginated(driveSpaceSchema), summary: '全部空间（租户 + 数据权限收窄；附近 30 天增速与预计用满天数）' }),
  createDepartmentSpace: op.post('/spaces/department', { access: { permission: 'drive:admin:space:edit' }, audit: '创建部门网盘空间', body: createDepartmentDriveSpaceSchema, response: driveSpaceSchema, summary: '创建部门空间' }),
  recalcUsage: op.post('/spaces/recalc', { access: { permission: 'drive:admin:space:edit' }, audit: '重算网盘容量', body: driveAdminTaskScopeSchema, response: asyncTaskSchema, summary: '重算容量（任务中心；不传 spaceId 为全部）' }),
  updateSpace: op.put('/spaces/{id}', { access: { permission: 'drive:admin:space:edit' }, audit: '治理网盘空间', params: idParam, body: adminUpdateDriveSpaceSchema, response: driveSpaceSchema, summary: '治理空间（配额 / 状态 / 所有者 / 外链开关）' }),
  handoff: op.post('/spaces/{id}/handoff', { access: { permission: 'drive:admin:space:edit' }, audit: '空间交接', params: idParam, body: handoffDriveSpaceSchema, response: driveSpaceSchema, summary: '个人或孤儿空间交接' }),
  removeSpace: op.delete('/spaces/{id}', { access: { permission: 'drive:admin:space:delete' }, audit: '删除网盘空间', params: idParam, summary: '删除空空间' }),
  reindex: op.post('/reindex', { access: { permission: 'drive:admin:space:edit' }, audit: '补建网盘索引', body: driveAdminTaskScopeSchema, response: asyncTaskSchema, summary: '补建缩略图 / 全文索引（任务中心）' }),
  shareLinks: op.get('/share-links', { access: { permission: 'drive:admin:link:list' }, query: driveAdminShareLinkListQuery, response: paginated(driveShareLinkSchema), summary: '全部外链（治理）' }),
  revokeShareLink: op.post('/share-links/{id}/revoke', { access: { permission: 'drive:admin:link:revoke' }, audit: '管理员撤销网盘外链', params: idParam, summary: '管理员撤销外链' }),
  shareAccessLogs: op.get('/share-access-logs', { access: { permission: 'drive:admin:link:list' }, query: driveAdminShareLogListQuery, response: paginated(driveShareAccessLogSchema), summary: '全部外链访问日志（治理；导出走导出中心 drive.share_access_logs）' }),
  activities: op.get('/activities', { access: { permission: 'drive:admin:activity:list' }, query: driveAdminActivityListQuery, response: paginated(driveActivitySchema), summary: '全局文件动态审计' }),
  legalHolds: op.get('/legal-holds', { access: { permission: 'drive:admin:space:list' }, query: driveLegalHoldListQuery, response: paginated(driveLegalHoldSchema), summary: '法律保留记录' }),
  createLegalHold: op.post('/legal-holds', { access: { permission: 'drive:admin:legal-hold:edit' }, audit: '设置网盘法律保留', body: createDriveLegalHoldSchema, response: driveLegalHoldSchema, summary: '对文件或文件夹（含子树）设置法律保留：不可删除 / 彻底删除 / 删版本 / 跨空间移动' }),
  releaseLegalHold: op.post('/legal-holds/{id}/release', { access: { permission: 'drive:admin:legal-hold:edit' }, audit: '解除网盘法律保留', params: idParam, body: releaseDriveLegalHoldSchema, response: driveLegalHoldSchema, summary: '解除法律保留' }),
  quotaRequests: op.get('/quota-requests', { access: { permission: 'drive:admin:space:list' }, query: driveQuotaRequestListQuery, response: paginated(driveQuotaRequestSchema), summary: '扩容申请（治理）' }),
  decideQuotaRequest: op.post('/quota-requests/{id}/decide', { access: { permission: 'drive:admin:quota:approve' }, audit: '审批网盘扩容申请', params: idParam, body: decideDriveQuotaRequestSchema, response: driveQuotaRequestSchema, summary: '审批扩容申请：通过即写入空间显式配额' }),
  openGrants: op.get('/open-grants', { access: { permission: 'drive:admin:space:list' }, query: driveOpenAppGrantListQuery, response: z.array(driveOpenAppGrantSchema), summary: '开放应用的空间授权（开放 API / Webhook 可见范围）' }),
  createOpenGrant: op.post('/open-grants', { access: { permission: 'drive:admin:open-grant:edit' }, audit: '授权开放应用访问网盘空间', body: createDriveOpenAppGrantSchema, response: driveOpenAppGrantSchema, summary: '授权开放应用访问某空间（同一应用 + 空间幂等覆盖）' }),
  removeOpenGrant: op.delete('/open-grants/{id}', { access: { permission: 'drive:admin:open-grant:edit' }, audit: '撤销开放应用的网盘空间授权', params: idParam, summary: '撤销开放应用的空间授权' }),
}, { auditModule: '企业网盘', tags: ['企业网盘-管理'] });
