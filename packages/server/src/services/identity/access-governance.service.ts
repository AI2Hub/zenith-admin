import { and, asc, desc, eq, gt, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { type AccessRequest, type AccessGrant, type AccessReviewCampaign, type AccessReviewItem, type PermissionPolicy, accessGovernanceContract, type AccessRequestListQuery, type AccessGrantListQuery, type AccessReviewItemListQuery } from '@zenith/shared/identity';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import type { QueryOutputOf } from '@zenith/shared/core';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { identityAccessGrantMenus, identityAccessGrants, identityAccessRequests, identityAccessReviewCampaigns, identityAccessReviewItems, identityPermissionPolicies, menus, roleMenus, roles, users, workflowInstances, workflowTasks } from '../../db/schema';
import { currentUser } from '../../lib/context';
import { exactTenantCondition, getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { requireRow } from '../../lib/db-assert';
import { requireTenantUser, resolveUserNames } from '../../lib/user-nicknames';
import { parseDateTimeInput, formatDateTime, formatNullableDateTime, formatTimestamps } from '../../lib/datetime';
import { buildWhere, dateRangeConditions, keywordCondition } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { pageOffset } from '../../lib/pagination';
import { pickEntity } from '../../lib/entity-map';
import { permissionPolicySchema, effectiveAccessPolicy } from '@zenith/shared/identity';
import { getTenantPackageFeatureSet } from '../../lib/tenant-package';
import { clearUserPermissionCache, isSuperAdmin } from '../../lib/permissions';
import { notify } from '../messaging/notification-outbox.service';
import { workflowEventBus } from '../../lib/workflow-event-bus';
import { ACCESS_REQUEST_BIZ_TYPE, accessWorkflowInputSchema, type AccessRiskLevel, type DataScope } from '@zenith/shared/identity';
import { workflowTransaction } from '../../lib/workflow-jobs/lease';
import { aggregateAccessPolicies, accessPolicyBaseline, higherAccessRisk } from '@zenith/shared/identity';
import { loadEffectiveAccessPolicies, readAccessPolicySet, assertPermissionPolicyUpdate, assertAccessSnapshotDuration } from './access-policy.service';
import { resolveAccessApprovalPlan } from './access-approval.service';
import type { CreateAccessReviewCampaignInput, DecideAccessReviewItemInput, RevokeAccessGrantInput, UpdatePermissionPolicyInput } from '@zenith/shared/identity';

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
    policySnapshot: row.policySnapshot,
    approvalPlan: row.approvalPlan,
    approvalEvidence: row.approvalEvidence,
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

type AccessRequestItemInput = {
  itemType: 'role' | 'menu';
  roleId?: number;
  menuId?: number;
  dataScope?: DataScope;
  deptScopeIds?: number[];
};

type ResolvedAccessRequestItem = {
  itemType: 'role' | 'menu';
  roleId: number | null;
  menuId: number | null;
  permissionCode: string | null;
  permissionLabel: string | null;
  dataScope: DataScope | null;
  deptScopeIds: number[];
  snapshot: Record<string, unknown>;
};

async function resolveRequestItems(itemsInput: AccessRequestItemInput[], tenantId: number | null, executor: DbExecutor = db) {
  const featureSet = await getTenantPackageFeatureSet(tenantId, executor);
  const roleIds = itemsInput.filter((item) => item.itemType === 'role').map((item) => item.roleId!).filter(Boolean);
  const menuIds = itemsInput.filter((item) => item.itemType === 'menu').map((item) => item.menuId!).filter(Boolean);
  const roleRows = roleIds.length > 0
    ? await executor.query.roles.findMany({
      where: and(inArray(roles.id, [...new Set(roleIds)]), exactTenantCondition(roles.tenantId, tenantId)),
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
  const items: ResolvedAccessRequestItem[] = [];
  let riskLevel: AccessRiskLevel = 'low';
  for (const requested of itemsInput) {
    if (requested.itemType === 'role') {
      const role = roleById.get(requested.roleId!);
      if (!role || role.status !== 'enabled') throw new HTTPException(400, { message: '只能申请启用中的角色' });
      if (['super_admin', 'tenant_admin', 'security_admin'].includes(role.code)) throw new HTTPException(400, { message: '管理身份不能通过临时权限包申请获取，请申请具体操作权限' });
      const roleMenusRows = role.roleMenus.filter(({ menu }) => menu.status === 'enabled');
      if (featureSet && roleMenusRows.some(({ menu }) => menu.featureKey && !featureSet.has(menu.featureKey))) {
        throw new HTTPException(400, { message: '角色包含超出当前租户套餐的权限' });
      }
      for (const { menu } of roleMenusRows) {
        const permissionCode = menu.permission ?? null;
        const permissionMeta = permissionCode ? ALL_PERMISSIONS[permissionCode] : undefined;
        const itemRisk = permissionMeta?.riskLevel ?? 'low';
        riskLevel = higherAccessRisk(riskLevel, itemRisk);
        items.push({
          itemType: 'role',
          roleId: role.id,
          menuId: menu.id,
          permissionCode,
          permissionLabel: permissionCode ? permissionMeta?.label ?? menu.title : null,
          dataScope: requested.dataScope ?? role.dataScope ?? null,
          deptScopeIds: (requested.deptScopeIds ?? []).length > 0 ? requested.deptScopeIds! : role.deptScopes.map(({ deptId }) => deptId),
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
      riskLevel = higherAccessRisk(riskLevel, itemRisk);
      items.push({
        itemType: 'menu',
        roleId: null,
        menuId: menu.id,
        permissionCode,
        permissionLabel: permissionCode ? permissionMeta?.label ?? menu.title : null,
        dataScope: requested.dataScope ?? null,
        deptScopeIds: requested.deptScopeIds ?? [],
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

export async function getAccessWorkflowOptions() {
  const user = currentUser();
  const featureSet = await getTenantPackageFeatureSet(user.tenantId);
  const [roleRows, menuRows] = await Promise.all([
    db.query.roles.findMany({
      where: and(eq(roles.status, 'enabled'), exactTenantCondition(roles.tenantId, user.tenantId)),
      with: { roleMenus: { columns: {}, with: { menu: { columns: { id: true, permission: true, status: true, featureKey: true } } } } },
      orderBy: [asc(roles.name), asc(roles.id)],
    }),
    db.select({ id: menus.id, parentId: menus.parentId, title: menus.title, name: menus.name, type: menus.type, permission: menus.permission, status: menus.status, featureKey: menus.featureKey })
      .from(menus).where(eq(menus.status, 'enabled')).orderBy(asc(menus.parentId), asc(menus.sort), asc(menus.id)),
  ]);
  const effective = await loadEffectiveAccessPolicies(menuRows.flatMap(menu => menu.permission && ALL_PERMISSIONS[menu.permission] ? [menu.permission] : []), user.tenantId);
  const policies = new Map(effective.map(policy => [policy.permissionCode, policy]));
  const roleOptions = roleRows.flatMap(role => {
    if (['super_admin', 'tenant_admin', 'security_admin'].includes(role.code)) return [];
    const rows = role.roleMenus.filter(({ menu }) => menu.status === 'enabled');
    if (featureSet && rows.some(({ menu }) => menu.featureKey && !featureSet.has(menu.featureKey))) return [];
    const codes = [...new Set(rows.flatMap(({ menu }) => menu.permission ? [menu.permission] : []))];
    const rolePolicies = codes.flatMap(code => { const policy = policies.get(code); return policy ? [policy] : []; });
    if (!rolePolicies.length || rolePolicies.length !== codes.length || rolePolicies.some(policy => !policy.enabled)) return [];
    return [{ id: role.id, name: role.name, code: role.code, description: role.description ?? null, dataScope: role.dataScope, menuCount: rows.length, ...aggregateAccessPolicies(rolePolicies) }];
  });
  return {
    roles: roleOptions,
    menus: menuRows.flatMap(menu => {
      const policy = menu.permission ? policies.get(menu.permission) : undefined;
      if (!policy?.enabled || (featureSet && menu.featureKey && !featureSet.has(menu.featureKey))) return [];
      return [{ id: menu.id, parentId: menu.parentId, title: menu.title, name: menu.name ?? null, type: menu.type, permission: menu.permission, permissionLabel: ALL_PERMISSIONS[policy.permissionCode].label,
        riskLevel: policy.riskLevel, approvalPolicy: policy.approvalPolicy, maxDurationMinutes: policy.maxDurationMinutes, mfaRequired: policy.mfaRequired }];
    }),
  };
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

type AccessWorkflowCaller = { userId: number; username: string; tenantId: number | null; roles?: string[] };

function positiveIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0))];
}

async function enrichAccessWorkflowFormData<T extends Record<string, unknown> & { roleIds: number[]; menuIds: number[] }>(input: T, caller: AccessWorkflowCaller) {
  const resolved = await resolveRequestItems([
    ...input.roleIds.map((roleId) => ({ itemType: 'role' as const, roleId })),
    ...input.menuIds.map((menuId) => ({ itemType: 'menu' as const, menuId })),
  ], caller.tenantId);
  if (resolved.items.length === 0) throw new HTTPException(400, { message: '至少申请一项有效权限' });
  const permissionCodes = resolved.items.flatMap(item => item.permissionCode ? [item.permissionCode] : []);
  if (!permissionCodes.length) throw new HTTPException(400, { message: '请选择至少一项实际操作权限' });
  const policySnapshot = await loadEffectiveAccessPolicies(permissionCodes, caller.tenantId);
  const forbidden = policySnapshot.find(policy => !policy.enabled);
  if (forbidden) throw new HTTPException(400, { message: `权限 ${forbidden.permissionCode} 不允许自助申请或已被策略停用` });
  const effective = aggregateAccessPolicies(policySnapshot);
  const approvalPlan = await resolveAccessApprovalPlan(caller.userId, caller.tenantId, effective.approvalPolicy, effective.mfaRequired);
  const names = await resolveUserNames([caller.userId]);
  return {
    ...input,
    targetUserId: caller.userId,
    targetUserName: names.get(caller.userId) ?? caller.username,
    riskLevel: effective.riskLevel,
    riskLabel: ({ low: '普通', high: '高危', critical: '极高危' } as const)[effective.riskLevel],
    approvalPolicy: effective.approvalPolicy,
    mfaRequired: effective.mfaRequired,
    maxDurationMinutes: effective.maxDurationMinutes,
    policySnapshot,
    approvalPlan,
    permissionItems: resolved.items,
    permissionSummary: resolved.items.map(item => item.permissionCode ? `${item.permissionLabel ?? item.permissionCode}（${item.permissionCode}）` : String(item.snapshot.menuTitle ?? '')).filter(Boolean).join('、'),
    managerId: approvalPlan.steps.find(step => step.nodeKey === 'approve_manager')?.userId,
    securityApproverId: approvalPlan.steps.find(step => step.nodeKey === 'approve_security')?.userId,
    secondSecurityApproverId: approvalPlan.steps.find(step => step.nodeKey === 'approve_second_security')?.userId,
  };
}

export async function previewAccessWorkflowFormData(raw: Record<string, unknown>, caller: AccessWorkflowCaller) {
  const roleIds = positiveIntArray(raw.roleIds);
  const menuIds = positiveIntArray(raw.menuIds);
  if (roleIds.length === 0 && menuIds.length === 0) return raw;
  return enrichAccessWorkflowFormData({ ...raw, roleIds, menuIds }, caller);
}

export async function assertNoOverlappingAccessRequest(input: {
  targetUserId: number;
  tenantId: number | null;
  startsAt: Date;
  expiresAt: Date;
  items: ResolvedAccessRequestItem[];
}, executor: DbExecutor = db): Promise<void> {
  const requestedMenuIds = [...new Set(input.items.map((item) => item.menuId).filter((id): id is number => id !== null))];
  if (requestedMenuIds.length === 0) return;
  const [grants, requests] = await Promise.all([
    executor.query.identityAccessGrants.findMany({
      where: and(
        eq(identityAccessGrants.userId, input.targetUserId),
        exactTenantCondition(identityAccessGrants.tenantId, input.tenantId),
        inArray(identityAccessGrants.status, ['scheduled', 'active']),
        lt(identityAccessGrants.startsAt, input.expiresAt),
        gt(identityAccessGrants.expiresAt, input.startsAt),
      ),
      with: { menus: true },
    }),
    executor.query.identityAccessRequests.findMany({
      where: and(
        eq(identityAccessRequests.targetUserId, input.targetUserId),
        exactTenantCondition(identityAccessRequests.tenantId, input.tenantId),
        inArray(identityAccessRequests.status, ['pending', 'approved']),
        lt(identityAccessRequests.startsAt, input.expiresAt),
        gt(identityAccessRequests.expiresAt, input.startsAt),
      ),
      with: { items: true },
    }),
  ]);
  const requested = new Set(requestedMenuIds);
  const labels = new Map(input.items.filter((item) => item.menuId !== null).map((item) => [item.menuId!, item.permissionLabel || item.permissionCode || `菜单#${item.menuId}`]));
  const conflicts = new Set<number>();
  for (const grant of grants) for (const item of grant.menus) if (requested.has(item.menuId)) conflicts.add(item.menuId);
  for (const request of requests) for (const item of request.items) if (item.menuId !== null && requested.has(item.menuId)) conflicts.add(item.menuId);
  if (conflicts.size > 0) {
    const names = [...conflicts].map((menuId) => labels.get(menuId) ?? `菜单#${menuId}`);
    throw new HTTPException(409, { message: `以下权限已有有效授权或待处理申请，请勿重复申请：${names.join('、')}` });
  }
}

export async function normalizeAccessWorkflowFormData(raw: Record<string, unknown>, caller: AccessWorkflowCaller) {
  const parsed = accessWorkflowInputSchema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? '权限申请表单不完整' });
  const input = parsed.data;
  const now = new Date();
  const startsAt = input.startMode === 'immediate' ? now : parseRequiredDate(input.startsAt!, '生效时间');
  const expiresAt = parseRequiredDate(input.expiresAt, '失效时间');
  if (input.startMode === 'scheduled' && startsAt < now) throw new HTTPException(400, { message: '预约生效时间不能早于当前时间' });
  if (expiresAt <= now) throw new HTTPException(400, { message: '失效时间必须晚于当前时间' });
  if (expiresAt <= startsAt) throw new HTTPException(400, { message: '失效时间必须晚于生效时间' });
  if (input.requestType === 'emergency' && expiresAt.getTime() - startsAt.getTime() > 60 * 60 * 1000) throw new HTTPException(400, { message: '紧急授权最长 60 分钟' });
  const enriched = await enrichAccessWorkflowFormData(input, caller);
  if (expiresAt.getTime() - startsAt.getTime() > enriched.maxDurationMinutes * 60_000) throw new HTTPException(400, { message: `所选权限最长授权 ${enriched.maxDurationMinutes} 分钟` });
  await assertNoOverlappingAccessRequest({
    targetUserId: caller.userId,
    tenantId: caller.tenantId,
    startsAt,
    expiresAt,
    items: enriched.permissionItems,
  });
  return {
    ...enriched,
    startsAt: formatDateTime(startsAt),
    expiresAt: formatDateTime(expiresAt),
  };
}

export async function applyApprovedAccessRequest(requestId: number, expected?: { workflowInstanceId: number; tenantId: number | null; approvedBy: number | null }): Promise<AccessGrant | null> {
  const result = await workflowTransaction(async (tx) => {
    const where = buildWhere(eq(identityAccessRequests.id, requestId), expected ? exactTenantCondition(identityAccessRequests.tenantId, expected.tenantId) : undefined);
    const [locked] = await tx.select({ id: identityAccessRequests.id }).from(identityAccessRequests).where(where).for('update').limit(1);
    if (!locked) throw new Error('权限申请不存在或不属于当前作业租户');
    const request = await tx.query.identityAccessRequests.findFirst({ where, with: { items: true } });
    if (!request) return null;
    if (request.status === 'applied') {
      const existing = await tx.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.requestId, requestId), with: { user: true, approver: true, revoker: true, menus: true } });
      return existing ? formatAccessGrant(existing) : null;
    }
    if (!['approved', 'failed'].includes(request.status)) return null;
    if (!request.workflowInstanceId || (expected && expected.workflowInstanceId !== request.workflowInstanceId)) throw new Error('权限申请流程关联无效');
    const workflow = await tx.query.workflowInstances.findFirst({ where: and(eq(workflowInstances.id, request.workflowInstanceId), exactTenantCondition(workflowInstances.tenantId, request.tenantId)), columns: { status: true, bizType: true, bizId: true } });
    if (workflow?.status !== 'approved' || workflow.bizType !== ACCESS_REQUEST_BIZ_TYPE || workflow.bizId !== String(request.id)) throw new Error('权限申请尚未获得有效的流程批准');
    await assertAccessSnapshotDuration(request.policySnapshot, request.startsAt, request.expiresAt, request.tenantId, tx);
    const approvers = new Set(request.approvalEvidence.map(evidence => evidence.actorId));
    if (approvers.has(request.targetUserId) || approvers.size !== request.approvalEvidence.length || request.approvalPlan.steps.some(step => !request.approvalEvidence.some(evidence => evidence.nodeKey === step.nodeKey && (!request.approvalPlan.mfaRequired || evidence.mfaVerifiedAt !== null)))) throw new Error('权限审批计划尚未完整履行');
    const target = await tx.query.users.findFirst({ where: and(eq(users.id, request.targetUserId), exactTenantCondition(users.tenantId, request.tenantId), eq(users.status, 'enabled')), columns: { id: true } });
    if (!target) throw new Error('权限申请受益用户已经停用');
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
      approvedBy: expected?.approvedBy ?? null,
      approvedAt: request.approvedAt,
      snapshot: { requestId: request.id, workflowInstanceId: request.workflowInstanceId },
    }).returning();
    const menuItems = request.items.filter((item) => item.menuId !== null).map((item) => ({
      grantId: grant.id,
      menuId: item.menuId!,
      permissionCode: item.permissionCode,
      permissionLabel: item.permissionLabel,
    }));
    if (menuItems.length > 0) await tx.insert(identityAccessGrantMenus).values(menuItems).onConflictDoNothing();
    await tx.update(identityAccessRequests).set({ status: 'applied', approvedAt: request.approvedAt ?? now, appliedAt: now, failureReason: null }).where(eq(identityAccessRequests.id, request.id));
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

export function registerAccessGovernanceSubscribers() {
  workflowEventBus.on('instance.created', async ({ instance }) => {
    if (instance.bizType !== ACCESS_REQUEST_BIZ_TYPE || !instance.bizId) return;
    const request = await db.query.identityAccessRequests.findFirst({ where: and(eq(identityAccessRequests.id, Number(instance.bizId)), eq(identityAccessRequests.workflowInstanceId, instance.id), exactTenantCondition(identityAccessRequests.tenantId, instance.tenantId)), with: { applicant: true, target: true } });
    if (!request) throw new Error('权限申请通知缺少已提交的业务记录');
    await notify('identity.access.requested', {
      recipients: [{ type: 'user', id: request.applicantUserId }],
      vars: { requestId: request.id, applicantName: request.applicant.nickname || request.applicant.username, targetName: request.target.nickname || request.target.username, riskLevel: request.riskLevel },
      tenantId: request.tenantId,
      dedupeKey: `identity-access-requested:${request.id}`,
    });
  });
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
  const tenantId = currentUser().tenantId;
  const entries = await readAccessPolicySet(Object.keys(ALL_PERMISSIONS), tenantId);
  const keyword = q.keyword?.toLowerCase();
  // 该视图由有界的代码目录与租户覆盖组合，筛选必须针对最终生效值。
  const rows = entries.map(({ policy, record }) => pickEntity(permissionPolicySchema, {
    ...record, ...policy, id: record?.id ?? 0, tenantId,
    createdAt: record?.createdAt ?? null, updatedAt: record?.updatedAt ?? null, createdBy: record?.createdBy ?? null, updatedBy: record?.updatedBy ?? null,
    inherited: record?.tenantId !== tenantId || !record,
    minimumRiskLevel: ALL_PERMISSIONS[policy.permissionCode].riskLevel ?? 'low',
    selfRequestable: accessPolicyBaseline(policy.permissionCode, ALL_PERMISSIONS[policy.permissionCode]).enabled,
  })).filter(row => (!keyword || row.permissionCode.toLowerCase().includes(keyword)) && (!q.riskLevel || row.riskLevel === q.riskLevel) && (!q.approvalPolicy || row.approvalPolicy === q.approvalPolicy));
  return buildListResult({ page: q.page, pageSize: q.pageSize, count: async () => rows.length, rows: async () => rows.slice(pageOffset(q.page, q.pageSize), pageOffset(q.page, q.pageSize) + q.pageSize) });
}

export async function updatePermissionPolicy(permissionCode: string, input: UpdatePermissionPolicyInput): Promise<PermissionPolicy> {
  assertPermissionPolicyUpdate(permissionCode, input);
  const tenantId = getCreateTenantId(currentUser());
  const [row] = await db.insert(identityPermissionPolicies).values({ permissionCode, tenantId, ...input })
    .onConflictDoUpdate({ target: [identityPermissionPolicies.permissionCode, identityPermissionPolicies.tenantId], set: { ...input, version: sql`${identityPermissionPolicies.version} + 1`, updatedAt: new Date() } }).returning();
  const baseline = accessPolicyBaseline(permissionCode, ALL_PERMISSIONS[permissionCode]);
  return pickEntity(permissionPolicySchema, { ...row, ...effectiveAccessPolicy(baseline, row), inherited: false, minimumRiskLevel: baseline.riskLevel, selfRequestable: baseline.enabled });
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
  const rows = await db.select({ id: workflowInstances.id, tenantId: workflowInstances.tenantId, bizType: workflowInstances.bizType, bizId: workflowInstances.bizId, status: workflowInstances.status, initiatorId: workflowInstances.initiatorId })
    .from(identityAccessRequests)
    .innerJoin(workflowInstances, eq(workflowInstances.id, identityAccessRequests.workflowInstanceId))
    .where(and(inArray(identityAccessRequests.status, ['pending', 'approved']), inArray(workflowInstances.status, ['approved', 'rejected', 'withdrawn', 'cancelled'])));
  const { bridgeAccessWorkflowOutcome } = await import('./access-workflow.service');
  for (const row of rows) await workflowTransaction(async (tx) => {
    await tx.select({ id: workflowInstances.id }).from(workflowInstances).where(eq(workflowInstances.id, row.id)).for('update');
    const approver = await tx.query.workflowTasks.findFirst({ where: and(eq(workflowTasks.instanceId, row.id), eq(workflowTasks.status, 'approved')), columns: { assigneeId: true }, orderBy: [desc(workflowTasks.actionAt), desc(workflowTasks.id)] });
    await bridgeAccessWorkflowOutcome(tx, row, approver?.assigneeId ?? null);
  });
  return `权限审批对账：核对 ${rows.length} 条，授权由可靠作业发放`;
}
