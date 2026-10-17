import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { type AccessRequest, type AccessGrant, type AccessReviewCampaign, type AccessReviewItem, type PermissionPolicy, accessGovernanceContract, type AccessRequestListQuery, type AccessGrantListQuery, type AccessReviewItemListQuery } from '@zenith/shared/identity';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import type { QueryOutputOf } from '@zenith/shared/core';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { departments, identityAccessGrantMenus, identityAccessGrants, identityAccessRequestItems, identityAccessRequests, identityAccessReviewCampaigns, identityAccessReviewItems, identityPermissionPolicies, menus, roleMenus, roles, userRoles, users, workflowInstances } from '../../db/schema';
import { currentUser } from '../../lib/context';
import { exactTenantCondition, getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { requireRow } from '../../lib/db-assert';
import { requireTenantUser, resolveUserNames } from '../../lib/user-nicknames';
import { parseDateTimeInput, formatDateTime, formatNullableDateTime, formatTimestamps } from '../../lib/datetime';
import { buildWhere, dateRangeConditions, keywordCondition } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { pageOffset } from '../../lib/pagination';
import { getTenantPackageFeatureSet } from '../../lib/tenant-package';
import { clearUserPermissionCache, isSuperAdmin } from '../../lib/permissions';
import { notify } from '../messaging/notification-outbox.service';
import { type AccessRiskLevel, type DataScope } from '@zenith/shared/identity';
import type { CreateAccessRequestInput, CreateAccessReviewCampaignInput, DecideAccessReviewItemInput, RevokeAccessGrantInput, UpdatePermissionPolicyInput } from '@zenith/shared/identity';

const ACCESS_RISK_PRIORITY: Record<AccessRiskLevel, number> = { low: 1, high: 2, critical: 3 };

function maxRisk(current: AccessRiskLevel, next: AccessRiskLevel): AccessRiskLevel {
  return ACCESS_RISK_PRIORITY[next] > ACCESS_RISK_PRIORITY[current] ? next : current;
}

function parseRequiredDate(value: string, label: string): Date {
  const parsed = parseDateTimeInput(value);
  if (!parsed) throw new HTTPException(400, { message: `${label}格式不正确` });
  return parsed;
}

function formatAccessRequest(row: any): AccessRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    applicantUserId: row.applicantUserId,
    applicantName: row.applicant ? (row.applicant.nickname || row.applicant.username) : null,
    targetUserId: row.targetUserId,
    targetUserName: row.target ? (row.target.nickname || row.target.username) : null,
    requestType: row.requestType,
    status: row.status,
    reason: row.reason,
    businessReference: row.businessReference ?? null,
    startsAt: formatDateTime(row.startsAt),
    expiresAt: formatDateTime(row.expiresAt),
    riskLevel: row.riskLevel,
    workflowInstanceId: row.workflowInstanceId ?? null,
    approvedAt: formatNullableDateTime(row.approvedAt),
    appliedAt: formatNullableDateTime(row.appliedAt),
    failureReason: row.failureReason ?? null,
    items: (row.items ?? []).map((item: any) => ({
      id: item.id,
      itemType: item.itemType,
      roleId: item.roleId ?? null,
      menuId: item.menuId ?? null,
      permissionCode: item.permissionCode ?? null,
      permissionLabel: item.permissionLabel ?? null,
      dataScope: item.dataScope ?? null,
      deptScopeIds: item.deptScopeIds ?? [],
      snapshot: item.snapshot ?? {},
    })),
    ...formatTimestamps(row),
  };
}

function formatAccessGrant(row: any): AccessGrant {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    userName: row.user ? (row.user.nickname || row.user.username) : null,
    requestId: row.requestId ?? null,
    sourceType: row.sourceType,
    status: row.status,
    riskLevel: row.riskLevel,
    dataScope: row.dataScope ?? null,
    deptScopeIds: row.deptScopeIds ?? [],
    startsAt: formatDateTime(row.startsAt),
    expiresAt: formatDateTime(row.expiresAt),
    approvedBy: row.approver?.id ?? row.approvedBy ?? null,
    approvedByName: row.approver ? (row.approver.nickname || row.approver.username) : null,
    revokedBy: row.revoker?.id ?? row.revokedBy ?? null,
    revokedAt: formatNullableDateTime(row.revokedAt),
    revokeReason: row.revokeReason ?? null,
    menus: (row.menus ?? []).map((item: any) => ({
      menuId: item.menuId,
      permissionCode: item.permissionCode ?? null,
      permissionLabel: item.permissionLabel ?? null,
    })),
    ...formatTimestamps(row),
  };
}

function formatReviewCampaign(row: any): AccessReviewCampaign {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    scopeType: row.scopeType,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewer ? (row.reviewer.nickname || row.reviewer.username) : null,
    dueAt: formatDateTime(row.dueAt),
    status: row.status,
    itemCount: row.itemCount,
    pendingCount: row.pendingCount,
    startedAt: formatDateTime(row.startedAt),
    completedAt: formatNullableDateTime(row.completedAt),
    ...formatTimestamps(row),
  };
}

function formatReviewItem(row: any): AccessReviewItem {
  return {
    id: row.id,
    campaignId: row.campaignId,
    tenantId: row.tenantId,
    userId: row.userId,
    userName: row.user ? (row.user.nickname || row.user.username) : null,
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    sourceLabel: row.sourceLabel ?? null,
    permissionCode: row.permissionCode ?? null,
    permissionLabel: row.permissionLabel ?? null,
    riskLevel: row.riskLevel,
    decision: row.decision,
    decidedBy: row.decidedBy ?? null,
    decidedAt: formatNullableDateTime(row.decidedAt),
    remark: row.remark ?? null,
    snapshot: row.snapshot ?? {},
    createdAt: formatDateTime(row.createdAt),
  };
}

async function resolveRequestItems(input: CreateAccessRequestInput, tenantId: number | null, executor: DbExecutor = db) {
  const featureSet = await getTenantPackageFeatureSet(tenantId, executor);
  const roleIds = input.items.filter((item) => item.itemType === 'role').map((item) => item.roleId!).filter(Boolean);
  const menuIds = input.items.filter((item) => item.itemType === 'menu').map((item) => item.menuId!).filter(Boolean);
  const roleRows = roleIds.length > 0
    ? await executor.query.roles.findMany({
      where: and(inArray(roles.id, [...new Set(roleIds)]), tenantCondition(roles, currentUser())),
      with: { roleMenus: { with: { menu: true } }, deptScopes: { columns: { deptId: true } } },
    })
    : [];
  if (roleRows.length !== new Set(roleIds).size) throw new HTTPException(400, { message: '存在无效或不可见的角色' });
  const menuRows = menuIds.length > 0
    ? await executor.select().from(menus).where(inArray(menus.id, [...new Set(menuIds)]))
    : [];
  if (menuRows.length !== new Set(menuIds).size) throw new HTTPException(400, { message: '存在无效的菜单权限' });
  const menuById = new Map(menuRows.map((menu) => [menu.id, menu]));
  const roleById = new Map(roleRows.map((role) => [role.id, role]));
  const items: Array<{
    itemType: 'role' | 'menu';
    roleId: number | null;
    menuId: number | null;
    permissionCode: string | null;
    permissionLabel: string | null;
    dataScope: DataScope | null;
    deptScopeIds: number[];
    snapshot: Record<string, unknown>;
  }> = [];
  let riskLevel: AccessRiskLevel = 'low';
  for (const requested of input.items) {
    if (requested.itemType === 'role') {
      const role = roleById.get(requested.roleId!);
      if (!role || role.status !== 'enabled') throw new HTTPException(400, { message: '只能申请启用中的角色' });
      const roleMenusRows = role.roleMenus.filter(({ menu }) => menu.status === 'enabled');
      if (featureSet && roleMenusRows.some(({ menu }) => menu.featureKey && !featureSet.has(menu.featureKey))) {
        throw new HTTPException(400, { message: '角色包含超出当前租户套餐的权限' });
      }
      for (const { menu } of roleMenusRows) {
        const permissionCode = menu.permission ?? null;
        const permissionMeta = permissionCode ? ALL_PERMISSIONS[permissionCode] : undefined;
        const itemRisk = permissionMeta?.riskLevel ?? 'low';
        riskLevel = maxRisk(riskLevel, itemRisk);
        items.push({
          itemType: 'role',
          roleId: role.id,
          menuId: menu.id,
          permissionCode,
          permissionLabel: permissionCode ? permissionMeta?.label ?? menu.title : null,
          dataScope: requested.dataScope ?? role.dataScope ?? null,
          deptScopeIds: requested.deptScopeIds.length > 0 ? requested.deptScopeIds : role.deptScopes.map(({ deptId }) => deptId),
          snapshot: { roleId: role.id, roleCode: role.code, roleName: role.name, menuId: menu.id, menuTitle: menu.title, permissionCode },
        });
      }
    } else {
      const menu = menuById.get(requested.menuId!);
      if (!menu || menu.status !== 'enabled') throw new HTTPException(400, { message: '只能申请启用中的菜单权限' });
      if (featureSet && menu.featureKey && !featureSet.has(menu.featureKey)) throw new HTTPException(400, { message: '所选菜单超出当前租户套餐功能范围' });
      const permissionCode = menu.permission ?? null;
      const permissionMeta = permissionCode ? ALL_PERMISSIONS[permissionCode] : undefined;
      const itemRisk = permissionMeta?.riskLevel ?? 'low';
      riskLevel = maxRisk(riskLevel, itemRisk);
      items.push({
        itemType: 'menu',
        roleId: null,
        menuId: menu.id,
        permissionCode,
        permissionLabel: permissionCode ? permissionMeta?.label ?? menu.title : null,
        dataScope: requested.dataScope ?? null,
        deptScopeIds: requested.deptScopeIds,
        snapshot: { menuId: menu.id, menuTitle: menu.title, permissionCode },
      });
    }
  }
  const deduped = new Map<string, (typeof items)[number]>();
  for (const item of items) deduped.set(`${item.menuId}:${item.permissionCode ?? ''}:${item.dataScope ?? ''}`, item);
  return { items: [...deduped.values()], riskLevel };
}

export async function assertDirectHighRiskGrantAllowed(menuIds: number[] = [], roleIds: number[] = []): Promise<void> {
  const actor = currentUser();
  if (isSuperAdmin({ roles: actor.roles, tenantId: actor.tenantId })) return;
  const requestedMenuIds = [...new Set(menuIds)];
  const requestedRoleIds = [...new Set(roleIds)];
  const directRows = requestedMenuIds.length > 0
    ? await db.select({ permission: menus.permission }).from(menus).where(inArray(menus.id, requestedMenuIds))
    : [];
  const roleRows = requestedRoleIds.length > 0
    ? await db.select({ permission: menus.permission }).from(roleMenus).innerJoin(menus, eq(menus.id, roleMenus.menuId)).where(inArray(roleMenus.roleId, requestedRoleIds))
    : [];
  const highRiskCodes = [...new Set([...directRows, ...roleRows].map((row) => row.permission).filter((permission): permission is string => !!permission))]
    .filter((permission) => ['high', 'critical'].includes(ALL_PERMISSIONS[permission]?.riskLevel ?? 'low'));
  if (highRiskCodes.length > 0) {
    throw new HTTPException(409, { message: `高危权限必须通过权限治理流程申请：${highRiskCodes.join('、')}` });
  }
}

export async function listAccessRequests(q: AccessRequestListQuery, mine = false) {
  const user = currentUser();
  const where = buildWhere(
    tenantCondition(identityAccessRequests, user),
    mine ? eq(identityAccessRequests.applicantUserId, user.userId) : undefined,
    keywordCondition(q.keyword, [identityAccessRequests.reason, identityAccessRequests.businessReference]),
    q.status ? eq(identityAccessRequests.status, q.status) : undefined,
    q.riskLevel ? eq(identityAccessRequests.riskLevel, q.riskLevel) : undefined,
    q.targetUserId ? eq(identityAccessRequests.targetUserId, q.targetUserId) : undefined,
    ...dateRangeConditions(identityAccessRequests.createdAt, q.startTime, q.endTime),
  );
  return buildListResult({
    page: q.page,
    pageSize: q.pageSize,
    count: () => db.$count(identityAccessRequests, where),
    rows: async () => db.query.identityAccessRequests.findMany({
      where,
      with: { applicant: true, target: true, items: true },
      orderBy: [desc(identityAccessRequests.createdAt), desc(identityAccessRequests.id)],
      limit: q.pageSize,
      offset: pageOffset(q.page, q.pageSize),
    }),
    map: formatAccessRequest,
  });
}

export async function getAccessRequest(id: number): Promise<AccessRequest> {
  const row = await db.query.identityAccessRequests.findFirst({
    where: and(eq(identityAccessRequests.id, id), tenantCondition(identityAccessRequests, currentUser())),
    with: { applicant: true, target: true, items: true },
  });
  return formatAccessRequest(requireRow(row, '权限申请不存在'));
}

export async function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  const user = currentUser();
  const tenantId = getCreateTenantId(user);
  const target = await requireTenantUser(input.targetUserId, '目标用户不存在或已停用', { enabledOnly: true });
  const startsAt = parseRequiredDate(input.startsAt, '生效时间');
  const expiresAt = parseRequiredDate(input.expiresAt, '失效时间');
  if (expiresAt <= startsAt) throw new HTTPException(400, { message: '失效时间必须晚于生效时间' });
  if (input.requestType === 'emergency' && expiresAt.getTime() - startsAt.getTime() > 60 * 60 * 1000) {
    throw new HTTPException(400, { message: '紧急授权最长 60 分钟' });
  }
  const resolved = await resolveRequestItems(input, tenantId);
  const created = await db.transaction(async (tx) => {
    const [request] = await tx.insert(identityAccessRequests).values({
      tenantId,
      applicantUserId: user.userId,
      targetUserId: target.id,
      requestType: input.requestType,
      status: 'draft',
      reason: input.reason,
      businessReference: input.businessReference ?? null,
      startsAt,
      expiresAt,
      riskLevel: resolved.riskLevel,
    }).returning();
    await tx.insert(identityAccessRequestItems).values(resolved.items.map((item) => ({
      requestId: request.id,
      itemType: item.itemType,
      roleId: item.roleId,
      menuId: item.menuId,
      permissionCode: item.permissionCode,
      permissionLabel: item.permissionLabel,
      dataScope: item.dataScope,
      deptScopeIds: item.deptScopeIds,
      snapshot: item.snapshot,
    })));
    return request;
  });
  return getAccessRequest(created.id);
}

async function resolveAccessApprovers(targetUserId: number, applicantUserId: number, tenantId: number | null): Promise<{ managerId: number; securityApproverId: number; secondSecurityApproverId: number }> {
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, targetUserId), exactTenantCondition(users.tenantId, tenantId)),
    columns: { departmentId: true, tenantId: true },
  });
  if (!target) throw new HTTPException(400, { message: '目标用户不存在' });
  const manager = target.departmentId
    ? await db.query.departments.findFirst({ where: and(eq(departments.id, target.departmentId), exactTenantCondition(departments.tenantId, tenantId)), columns: { leaderId: true } })
    : null;
  const candidates = await db.select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(
      eq(users.status, 'enabled'),
      exactTenantCondition(users.tenantId, tenantId),
      or(
        and(eq(roles.code, 'tenant_admin'), exactTenantCondition(roles.tenantId, target.tenantId)),
        and(eq(roles.code, 'security_admin'), exactTenantCondition(roles.tenantId, target.tenantId)),
        and(eq(roles.code, 'super_admin'), isNull(roles.tenantId)),
      ),
    ));
  const securityIds = [...new Set(candidates.map((candidate) => candidate.id))].filter((candidateId) => candidateId !== applicantUserId && candidateId !== targetUserId);
  const managerId = manager?.leaderId && manager.leaderId !== applicantUserId && manager.leaderId !== targetUserId
    ? manager.leaderId
    : securityIds[0];
  const securityApproverId = securityIds.find((candidateId) => candidateId !== managerId);
  const secondSecurityApproverId = securityIds.find((candidateId) => candidateId !== managerId && candidateId !== securityApproverId);
  if (!managerId || !securityApproverId || !secondSecurityApproverId) {
    throw new HTTPException(409, { message: '权限申请缺少满足安全策略的审批人，请先配置直属主管和安全管理员' });
  }
  return { managerId, securityApproverId, secondSecurityApproverId };
}

async function startAccessRequestWorkflow(requestId: number, tenantId: number | null) {
  const request = await db.query.identityAccessRequests.findFirst({
    where: and(eq(identityAccessRequests.id, requestId), exactTenantCondition(identityAccessRequests.tenantId, tenantId)),
    with: { target: true, applicant: true, items: true },
  });
  if (!request) throw new HTTPException(404, { message: '权限申请不存在' });
  const { resolveBizDefinitionId, startWorkflowForBiz } = await import('../../lib/workflow-biz-bridge');
  const approvers = await resolveAccessApprovers(request.targetUserId, request.applicantUserId, request.tenantId);
  const definitionName = request.riskLevel === 'critical' ? '权限申请（极高危）' : request.riskLevel === 'high' ? '权限申请（高危）' : '权限申请（普通）';
  const definitionId = await resolveBizDefinitionId({ name: definitionName, formType: 'external' });
  const instance = await startWorkflowForBiz({
    definitionId,
    title: `权限申请 #${request.id} · ${request.target.nickname || request.target.username}`,
    bizType: 'identity_access_request',
    bizId: request.id,
    variables: {
      requestId: request.id,
      targetUserId: request.targetUserId,
      reason: request.reason,
      businessReference: request.businessReference ?? '',
      startsAt: formatDateTime(request.startsAt),
      expiresAt: formatDateTime(request.expiresAt),
      riskLevel: request.riskLevel,
      permissionSummary: request.items.map((item) => item.permissionCode || item.snapshot?.menuTitle || item.snapshot?.roleName || '').filter(Boolean).join(', '),
      ...approvers,
    },
    caller: { userId: request.applicantUserId, username: request.applicant.username, tenantId: request.tenantId, roles: [] },
  });
  await db.update(identityAccessRequests).set({ workflowInstanceId: instance.id, status: 'pending' }).where(and(eq(identityAccessRequests.id, requestId), exactTenantCondition(identityAccessRequests.tenantId, request.tenantId)));
  const approverIds = [...new Set([approvers.managerId, approvers.securityApproverId, approvers.secondSecurityApproverId])];
  await notify('identity.access.requested', {
    recipients: approverIds.map((id) => ({ type: 'user' as const, id })),
    vars: { requestId: request.id, applicantName: request.applicant.nickname || request.applicant.username, targetName: request.target.nickname || request.target.username, riskLevel: request.riskLevel },
    tenantId: request.tenantId,
    dedupeKey: `identity-access-requested:${request.id}`,
  });
  return instance;
}

export async function applyApprovedAccessRequest(requestId: number): Promise<AccessGrant | null> {
  const result = await db.transaction(async (tx) => {
    const request = await tx.query.identityAccessRequests.findFirst({ where: eq(identityAccessRequests.id, requestId), with: { items: true } });
    if (!request) return null;
    if (request.status === 'applied') {
      const existing = await tx.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.requestId, requestId), with: { user: true, approver: true, revoker: true, menus: true } });
      return existing ? formatAccessGrant(existing) : null;
    }
    if (!['pending', 'approved'].includes(request.status)) return null;
    const now = new Date();
    const status = request.startsAt > now ? 'scheduled' : 'active';
    const [grant] = await tx.insert(identityAccessGrants).values({
      tenantId: request.tenantId,
      userId: request.targetUserId,
      requestId: request.id,
      sourceType: request.requestType === 'emergency' ? 'emergency' : 'request',
      status,
      riskLevel: request.riskLevel,
      startsAt: request.startsAt,
      expiresAt: request.expiresAt,
      snapshot: { requestId: request.id, workflowInstanceId: request.workflowInstanceId },
    }).returning();
    const menuItems = request.items.filter((item) => item.menuId !== null).map((item) => ({
      grantId: grant.id,
      menuId: item.menuId!,
      permissionCode: item.permissionCode,
      permissionLabel: item.permissionLabel,
    }));
    if (menuItems.length > 0) await tx.insert(identityAccessGrantMenus).values(menuItems).onConflictDoNothing();
    await tx.update(identityAccessRequests).set({ status: 'applied', approvedAt: now, appliedAt: now }).where(eq(identityAccessRequests.id, request.id));
    const applied = await tx.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.id, grant.id), with: { user: true, approver: true, revoker: true, menus: true } });
    return applied ? formatAccessGrant(applied) : null;
  });
  const grantUserId = result?.userId;
  if (grantUserId) {
    await clearUserPermissionCache(grantUserId);
    const target = await db.query.users.findFirst({ where: eq(users.id, grantUserId), columns: { nickname: true, username: true } });
    if (result?.requestId && target) {
      const request = await db.query.identityAccessRequests.findFirst({ where: eq(identityAccessRequests.id, result.requestId), columns: { expiresAt: true, tenantId: true } });
      if (request) await notify('identity.access.approved', {
        recipients: [{ type: 'user', id: grantUserId }],
        vars: { requestId: result.requestId, targetName: target.nickname || target.username, expiresAt: formatDateTime(request.expiresAt) },
        tenantId: request.tenantId,
        dedupeKey: `identity-access-approved:${result.requestId}`,
      });
    }
  }
  return result;
}

export async function registerAccessGovernanceSubscribers() {
  const { onWorkflowResult } = await import('../../lib/workflow-biz-bridge');
  onWorkflowResult('identity_access_request', {
    onApproved: async (instance) => { if (instance.bizId) await applyApprovedAccessRequest(Number(instance.bizId)); },
    onRejected: async (instance) => { if (instance.bizId) await db.update(identityAccessRequests).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(identityAccessRequests.id, Number(instance.bizId)), eq(identityAccessRequests.status, 'pending'))); },
    onWithdrawn: async (instance) => { if (instance.bizId) await db.update(identityAccessRequests).set({ status: 'cancelled' }).where(and(eq(identityAccessRequests.id, Number(instance.bizId)), eq(identityAccessRequests.status, 'pending'))); },
  });
}

export async function submitAccessRequest(id: number): Promise<AccessRequest> {
  const user = currentUser();
  const request = await db.query.identityAccessRequests.findFirst({
    where: and(eq(identityAccessRequests.id, id), tenantCondition(identityAccessRequests, user)),
    columns: { id: true, tenantId: true, applicantUserId: true, status: true, startsAt: true, expiresAt: true },
  });
  const requestRow = requireRow(request, '权限申请不存在');
  if (requestRow.applicantUserId !== user.userId) throw new HTTPException(403, { message: '只能提交自己的权限申请' });
  if (requestRow.status !== 'draft') throw new HTTPException(400, { message: '当前申请状态不能提交' });
  if (requestRow.expiresAt <= requestRow.startsAt || requestRow.expiresAt <= new Date()) throw new HTTPException(400, { message: '申请有效期已失效' });
  try {
    await startAccessRequestWorkflow(id, requestRow.tenantId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '启动权限审批流程失败';
    await db.update(identityAccessRequests).set({ status: 'failed', failureReason: message }).where(eq(identityAccessRequests.id, id));
    throw error;
  }
  return getAccessRequest(id);
}

export async function cancelAccessRequest(id: number): Promise<AccessRequest> {
  const user = currentUser();
  const request = await db.query.identityAccessRequests.findFirst({
    where: and(eq(identityAccessRequests.id, id), tenantCondition(identityAccessRequests, user)),
    columns: { id: true, applicantUserId: true, status: true },
  });
  const requestRow = requireRow(request, '权限申请不存在');
  if (requestRow.applicantUserId !== user.userId) throw new HTTPException(403, { message: '只能取消自己的权限申请' });
  if (!['draft', 'pending'].includes(requestRow.status)) throw new HTTPException(400, { message: '当前申请状态不能取消' });
  await db.update(identityAccessRequests).set({ status: 'cancelled' }).where(eq(identityAccessRequests.id, id));
  return getAccessRequest(id);
}

export async function listAccessGrants(q: AccessGrantListQuery) {
  const user = currentUser();
  const where = buildWhere(
    tenantCondition(identityAccessGrants, user),
    keywordCondition(q.keyword, [identityAccessGrants.snapshot]),
    q.status ? eq(identityAccessGrants.status, q.status) : undefined,
    q.riskLevel ? eq(identityAccessGrants.riskLevel, q.riskLevel) : undefined,
    q.userId ? eq(identityAccessGrants.userId, q.userId) : undefined,
  );
  return buildListResult({
    page: q.page,
    pageSize: q.pageSize,
    count: () => db.$count(identityAccessGrants, where),
    rows: async () => db.query.identityAccessGrants.findMany({
      where,
      with: { user: true, approver: true, revoker: true, menus: true },
      orderBy: [desc(identityAccessGrants.createdAt), desc(identityAccessGrants.id)],
      limit: q.pageSize,
      offset: pageOffset(q.page, q.pageSize),
    }),
    map: formatAccessGrant,
  });
}

export async function getAccessGrant(id: number): Promise<AccessGrant> {
  const row = await db.query.identityAccessGrants.findFirst({
    where: and(eq(identityAccessGrants.id, id), tenantCondition(identityAccessGrants, currentUser())),
    with: { user: true, approver: true, revoker: true, menus: true },
  });
  return formatAccessGrant(requireRow(row, '临时授权不存在'));
}

export async function revokeAccessGrant(id: number, input: RevokeAccessGrantInput): Promise<AccessGrant> {
  const user = currentUser();
  const row = await db.query.identityAccessGrants.findFirst({
    where: and(eq(identityAccessGrants.id, id), tenantCondition(identityAccessGrants, user)),
    columns: { id: true, userId: true, status: true },
  });
  const grantRow = requireRow(row, '临时授权不存在');
  if (!['scheduled', 'active'].includes(grantRow.status)) throw new HTTPException(400, { message: '当前授权状态不能撤销' });
  await db.update(identityAccessGrants).set({ status: 'revoked', revokedBy: user.userId, revokedAt: new Date(), revokeReason: input.reason }).where(eq(identityAccessGrants.id, id));
  await clearUserPermissionCache(grantRow.userId);
  return getAccessGrant(id);
}

export async function listPermissionPolicies(q: QueryOutputOf<typeof accessGovernanceContract.policyList>) {
  const user = currentUser();
  const where = buildWhere(
    tenantCondition(identityPermissionPolicies, user),
    keywordCondition(q.keyword, [identityPermissionPolicies.permissionCode]),
    q.riskLevel ? eq(identityPermissionPolicies.riskLevel, q.riskLevel) : undefined,
    q.approvalPolicy ? eq(identityPermissionPolicies.approvalPolicy, q.approvalPolicy) : undefined,
  );
  return buildListResult({
    page: q.page,
    pageSize: q.pageSize,
    count: () => db.$count(identityPermissionPolicies, where),
    rows: async () => db.query.identityPermissionPolicies.findMany({
      where,
      orderBy: [asc(identityPermissionPolicies.permissionCode)],
      limit: q.pageSize,
      offset: pageOffset(q.page, q.pageSize),
    }),
    map: (row) => ({ ...row, ...formatTimestamps(row) }),
  });
}

export async function updatePermissionPolicy(permissionCode: string, input: UpdatePermissionPolicyInput): Promise<PermissionPolicy> {
  const user = currentUser();
  const tenantId = getCreateTenantId(user);
  const existing = await db.query.identityPermissionPolicies.findFirst({
    where: and(eq(identityPermissionPolicies.permissionCode, permissionCode), tenantCondition(identityPermissionPolicies, user)),
  });
  const row = existing
    ? (await db.update(identityPermissionPolicies).set(input).where(eq(identityPermissionPolicies.id, existing.id)).returning())[0]
    : (await db.insert(identityPermissionPolicies).values({ permissionCode, tenantId, ...input }).returning())[0];
  return { ...row, ...formatTimestamps(row) };
}

export async function createAccessReviewCampaign(input: CreateAccessReviewCampaignInput): Promise<AccessReviewCampaign> {
  const user = currentUser();
  const tenantId = getCreateTenantId(user);
  const reviewer = await requireTenantUser(input.reviewerId, '复核负责人不存在或已停用', { enabledOnly: true });
  const dueAt = parseRequiredDate(input.dueAt, '截止时间');
  const grantWhere = buildWhere(
    tenantCondition(identityAccessGrants, user),
    inArray(identityAccessGrants.status, ['scheduled', 'active']),
    input.scopeType === 'high_risk' ? inArray(identityAccessGrants.riskLevel, ['high', 'critical']) : undefined,
    input.scopeType === 'temporary' ? eq(identityAccessGrants.sourceType, 'request') : undefined,
  );
  const grants = await db.query.identityAccessGrants.findMany({ where: grantWhere, with: { user: true, menus: true } });
  const [row, items] = await db.transaction(async (tx) => {
    const [campaign] = await tx.insert(identityAccessReviewCampaigns).values({ tenantId, name: input.name, scopeType: input.scopeType, reviewerId: reviewer.id, dueAt }).returning();
    const reviewRows = grants.flatMap((grant) => grant.menus.map((menu) => ({
      campaignId: campaign.id,
      tenantId: grant.tenantId,
      userId: grant.userId,
      sourceType: 'temporary_grant' as const,
      sourceId: grant.id,
      sourceLabel: `临时授权 #${grant.id}`,
      permissionCode: menu.permissionCode,
      permissionLabel: menu.permissionLabel,
      riskLevel: grant.riskLevel,
      decision: 'pending' as const,
      snapshot: { grantId: grant.id, menuId: menu.menuId, startsAt: grant.startsAt.toISOString(), expiresAt: grant.expiresAt.toISOString() },
    })));
    if (reviewRows.length > 0) await tx.insert(identityAccessReviewItems).values(reviewRows);
    return [campaign, reviewRows] as const;
  });
  return formatReviewCampaign({ ...row, reviewer, itemCount: items.length, pendingCount: items.length });
}

export async function listReviewCampaigns(q: QueryOutputOf<typeof accessGovernanceContract.reviewCampaignList>) {
  const user = currentUser();
  const where = tenantCondition(identityAccessReviewCampaigns, user);
  return buildListResult({
    page: q.page,
    pageSize: q.pageSize,
    count: () => db.$count(identityAccessReviewCampaigns, where),
    rows: async () => {
      const rows = await db.query.identityAccessReviewCampaigns.findMany({
        where,
        with: { reviewer: true },
        orderBy: [desc(identityAccessReviewCampaigns.createdAt), desc(identityAccessReviewCampaigns.id)],
        limit: q.pageSize,
        offset: pageOffset(q.page, q.pageSize),
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      const counts = await db.select({ campaignId: identityAccessReviewItems.campaignId, total: db.$count(identityAccessReviewItems, eq(identityAccessReviewItems.campaignId, identityAccessReviewCampaigns.id)) }).from(identityAccessReviewItems).where(inArray(identityAccessReviewItems.campaignId, ids)).groupBy(identityAccessReviewItems.campaignId);
      const pending = await db.select({ campaignId: identityAccessReviewItems.campaignId, total: db.$count(identityAccessReviewItems, and(eq(identityAccessReviewItems.campaignId, identityAccessReviewCampaigns.id), eq(identityAccessReviewItems.decision, 'pending'))) }).from(identityAccessReviewItems).where(inArray(identityAccessReviewItems.campaignId, ids)).groupBy(identityAccessReviewItems.campaignId);
      const countMap = new Map(counts.map((item) => [item.campaignId, Number(item.total)]));
      const pendingMap = new Map(pending.map((item) => [item.campaignId, Number(item.total)]));
      return rows.map((row) => ({ ...row, itemCount: countMap.get(row.id) ?? 0, pendingCount: pendingMap.get(row.id) ?? 0 }));
    },
    map: formatReviewCampaign,
  });
}

export async function listReviewItems(q: AccessReviewItemListQuery) {
  const user = currentUser();
  const where = buildWhere(
    tenantCondition(identityAccessReviewItems, user),
    q.decision ? eq(identityAccessReviewItems.decision, q.decision) : undefined,
    q.riskLevel ? eq(identityAccessReviewItems.riskLevel, q.riskLevel) : undefined,
    q.sourceType ? eq(identityAccessReviewItems.sourceType, q.sourceType) : undefined,
    q.userId ? eq(identityAccessReviewItems.userId, q.userId) : undefined,
  );
  return buildListResult({
    page: q.page,
    pageSize: q.pageSize,
    count: () => db.$count(identityAccessReviewItems, where),
    rows: async () => db.query.identityAccessReviewItems.findMany({
      where,
      with: { user: true },
      orderBy: [desc(identityAccessReviewItems.createdAt), desc(identityAccessReviewItems.id)],
      limit: q.pageSize,
      offset: pageOffset(q.page, q.pageSize),
    }),
    map: formatReviewItem,
  });
}

export async function decideReviewItem(id: number, input: DecideAccessReviewItemInput): Promise<AccessReviewItem> {
  const user = currentUser();
  const item = await db.query.identityAccessReviewItems.findFirst({ where: and(eq(identityAccessReviewItems.id, id), tenantCondition(identityAccessReviewItems, user)) });
  const reviewItem = requireRow(item, '权限复核项不存在');
  if (reviewItem.decision !== 'pending') throw new HTTPException(400, { message: '该复核项已经处理' });
  await db.update(identityAccessReviewItems).set({ decision: input.decision, decidedBy: user.userId, decidedAt: new Date(), remark: input.remark ?? null }).where(eq(identityAccessReviewItems.id, id));
  if (input.decision === 'revoke' && reviewItem.sourceType === 'temporary_grant' && reviewItem.sourceId) {
    await revokeAccessGrant(reviewItem.sourceId, { reason: input.remark ?? '权限复核撤销' });
  }
  const row = await db.query.identityAccessReviewItems.findFirst({ where: eq(identityAccessReviewItems.id, id), with: { user: true } });
  return formatReviewItem(requireRow(row, '权限复核项不存在'));
}

export async function getUserAccessOverview(userId: number) {
  await requireTenantUser(userId, '用户不存在');
  const [grants, reviews] = await Promise.all([
    db.query.identityAccessGrants.findMany({ where: and(eq(identityAccessGrants.userId, userId), tenantCondition(identityAccessGrants, currentUser())), with: { user: true, approver: true, revoker: true, menus: true }, orderBy: [desc(identityAccessGrants.createdAt)] }),
    db.query.identityAccessReviewItems.findMany({ where: and(eq(identityAccessReviewItems.userId, userId), tenantCondition(identityAccessReviewItems, currentUser())), with: { user: true }, orderBy: [desc(identityAccessReviewItems.createdAt)] }),
  ]);
  return { userId, grants: grants.map(formatAccessGrant), reviews: reviews.map(formatReviewItem) };
}

/** Active temporary permission rows used by the central permission resolver. */
export async function listActiveGrantMenuRows(userId: number, executor: DbExecutor = db) {
  const now = new Date();
  return executor.select({
    grantId: identityAccessGrants.id,
    startsAt: identityAccessGrants.startsAt,
    expiresAt: identityAccessGrants.expiresAt,
    menuId: menus.id,
    permission: menus.permission,
    visible: menus.visible,
    status: menus.status,
    featureKey: menus.featureKey,
  }).from(identityAccessGrants)
    .innerJoin(identityAccessGrantMenus, eq(identityAccessGrantMenus.grantId, identityAccessGrants.id))
    .innerJoin(menus, eq(menus.id, identityAccessGrantMenus.menuId))
    .where(and(
      eq(identityAccessGrants.userId, userId),
      inArray(identityAccessGrants.status, ['scheduled', 'active']),
      lte(identityAccessGrants.startsAt, now),
      gt(identityAccessGrants.expiresAt, now),
    ));
}

export async function listGrantBoundaries(userId: number, executor: DbExecutor = db): Promise<number | null> {
  const now = new Date();
  const rows = await executor.select({ startsAt: identityAccessGrants.startsAt, expiresAt: identityAccessGrants.expiresAt })
    .from(identityAccessGrants)
    .where(and(eq(identityAccessGrants.userId, userId), inArray(identityAccessGrants.status, ['scheduled', 'active']), or(gt(identityAccessGrants.startsAt, now), gt(identityAccessGrants.expiresAt, now))));
  const boundaries = rows.flatMap((row) => [row.startsAt, row.expiresAt]).filter((value) => value.getTime() > now.getTime()).map((value) => value.getTime());
  return boundaries.length > 0 ? Math.min(...boundaries) : null;
}

export async function listActiveGrantScopes(userId: number, executor: DbExecutor = db) {
  const now = new Date();
  return executor.select({ dataScope: identityAccessGrants.dataScope, deptScopeIds: identityAccessGrants.deptScopeIds })
    .from(identityAccessGrants)
    .where(and(eq(identityAccessGrants.userId, userId), inArray(identityAccessGrants.status, ['scheduled', 'active']), lte(identityAccessGrants.startsAt, now), gt(identityAccessGrants.expiresAt, now)));
}

export async function runAccessGrantLifecycle(): Promise<string> {
  const now = new Date();
  const activated = await db.update(identityAccessGrants)
    .set({ status: 'active' })
    .where(and(eq(identityAccessGrants.status, 'scheduled'), lte(identityAccessGrants.startsAt, now), gt(identityAccessGrants.expiresAt, now)))
    .returning({ id: identityAccessGrants.id, userId: identityAccessGrants.userId });
  const expired = await db.update(identityAccessGrants)
    .set({ status: 'expired' })
    .where(and(inArray(identityAccessGrants.status, ['scheduled', 'active']), lte(identityAccessGrants.expiresAt, now)))
    .returning({ id: identityAccessGrants.id, userId: identityAccessGrants.userId, tenantId: identityAccessGrants.tenantId });
  const affectedUserIds = [...new Set([...activated, ...expired].map((row) => row.userId))];
  await Promise.all(affectedUserIds.map((userId) => clearUserPermissionCache(userId)));
  const names = await resolveUserNames(expired.map((row) => row.userId));
  await Promise.all(expired.map((row) => notify('identity.access.expired', {
    recipients: [{ type: 'user', id: row.userId }],
    vars: { grantId: row.id, targetName: names.get(row.userId) ?? `用户 ${row.userId}` },
    tenantId: row.tenantId,
    dedupeKey: `identity-access-expired:${row.id}`,
  })));
  const expiring = await db.query.identityAccessGrants.findMany({
    where: and(eq(identityAccessGrants.status, 'active'), gt(identityAccessGrants.expiresAt, now), lte(identityAccessGrants.expiresAt, new Date(now.getTime() + 24 * 60 * 60 * 1000))),
    columns: { id: true, userId: true, expiresAt: true, tenantId: true },
  });
  const expiringNames = await resolveUserNames(expiring.map((row) => row.userId));
  await Promise.all(expiring.map((row) => notify('identity.access.expiring', {
    recipients: [{ type: 'user', id: row.userId }],
    vars: { grantId: row.id, targetName: expiringNames.get(row.userId) ?? `用户 ${row.userId}`, expiresAt: formatDateTime(row.expiresAt) },
    tenantId: row.tenantId,
    dedupeKey: `identity-access-expiring:${row.id}:${row.expiresAt.toISOString().slice(0, 10)}`,
  })));
  return `激活 ${activated.length} 条，过期 ${expired.length} 条，提醒 ${expiring.length} 条`;
}

export async function reconcileAccessGovernance(): Promise<string> {
  const rows = await db.select({ requestId: identityAccessRequests.id, workflowStatus: workflowInstances.status })
    .from(identityAccessRequests)
    .innerJoin(workflowInstances, eq(workflowInstances.id, identityAccessRequests.workflowInstanceId))
    .where(eq(identityAccessRequests.status, 'pending'));
  let applied = 0;
  let rejected = 0;
  let cancelled = 0;
  for (const row of rows) {
    if (row.workflowStatus === 'approved') {
      if (await applyApprovedAccessRequest(row.requestId)) applied += 1;
    } else if (row.workflowStatus === 'rejected') {
      await db.update(identityAccessRequests).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(identityAccessRequests.id, row.requestId), eq(identityAccessRequests.status, 'pending')));
      rejected += 1;
    } else if (row.workflowStatus === 'withdrawn' || row.workflowStatus === 'cancelled') {
      await db.update(identityAccessRequests).set({ status: 'cancelled' }).where(and(eq(identityAccessRequests.id, row.requestId), eq(identityAccessRequests.status, 'pending')));
      cancelled += 1;
    }
  }
  return `权限审批对账：生效 ${applied}，驳回 ${rejected}，取消 ${cancelled}`;
}
