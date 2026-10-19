import { and, asc, desc, eq, exists, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { type AccessRequest, type AccessGrant, type PermissionPolicy, accessGovernanceContract } from '@zenith/shared/identity';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import type { QueryOutputOf } from '@zenith/shared/core';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { identityAccessGrantMenus, identityAccessGrants, identityAccessRequests, identityAccessReviewItems, identityPermissionPolicies, menus, roleMenus, roles, users, workflowInstances, workflowTasks } from '../../db/schema';
import { currentUser, setAuditBefore } from '../../lib/context';
import { exactTenantCondition, getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { requireRow } from '../../lib/db-assert';
import { requireTenantUser, resolveUserNames } from '../../lib/user-nicknames';
import { parseDateTimeInput, formatDateTime } from '../../lib/datetime';
import { buildWhere, dateRangeConditions, keywordCondition } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { pageOffset } from '../../lib/pagination';
import { effectiveAccessPolicy } from '@zenith/shared/identity';
import { getTenantPackageFeatureSet } from '../../lib/tenant-package';
import { notifyUserPermissionsChanged, isSuperAdmin } from '../../lib/permissions';
import { notifyWithin } from '../messaging/notification-outbox.service';
import { ACCESS_REQUEST_BIZ_TYPE, accessWorkflowInputSchema, type AccessRiskLevel, type DataScope } from '@zenith/shared/identity';
import { workflowTransaction } from '../../lib/workflow-jobs/lease';
import { aggregateAccessPolicies, accessPolicyBaseline, higherAccessRisk, mergeAccessPermissionItems } from '@zenith/shared/identity';
import { loadEffectiveAccessPolicies, readAccessPolicySet, assertPermissionPolicyUpdate, assertAccessSnapshotDuration } from './access-policy.service';
import { resolveAccessApprovalPlan, assertAccessGrantApproversCurrent } from './access-approval.service';
import { formatAccessRequest, formatAccessGrant, formatPermissionPolicy, formatReviewItem } from './access-formatters';
import { assertNoOverlappingAccessRequest } from './access-reservations.service';
export { assertNoOverlappingAccessRequest } from './access-reservations.service';
export { revokeAccessGrant, revokeAccessGrantItem, retryAccessRequestProvision, runAccessGrantLifecycle } from './access-grants.service';
export { getAccessReviewOptions, createAccessReviewCampaign, listReviewCampaigns, listReviewItems, decideReviewItem, retryAccessReviewCampaign, assignAccessReviewCampaign } from './access-review.service';
import type { UpdatePermissionPolicyInput } from '@zenith/shared/identity';

function parseRequiredDate(value: string, label: string): Date {
  const parsed = parseDateTimeInput(value);
  if (!parsed) throw new HTTPException(400, { message: `${label}格式不正确` });
  return parsed;
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

export async function listAccessRequests(q: QueryOutputOf<typeof accessGovernanceContract.requestList>, mine = false) {
  const user = currentUser();
  const where = buildWhere(
    mine ? undefined : tenantCondition(identityAccessRequests, user),
    mine ? eq(identityAccessRequests.applicantUserId, user.userId) : undefined,
    keywordCondition(q.keyword, [identityAccessRequests.reason, identityAccessRequests.businessReference]),
    q.status ? eq(identityAccessRequests.status, q.status) : undefined,
    q.provisionStatus ? eq(identityAccessRequests.provisionStatus, q.provisionStatus) : undefined,
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

type AccessWorkflowCaller = { userId: number; username: string; tenantId: number | null; roles?: string[]; viewingTenantId?: number | null };

function positiveIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0))];
}

async function enrichAccessWorkflowFormData<T extends Record<string, unknown> & { roleIds: number[]; menuIds: number[] }>(input: T, caller: AccessWorkflowCaller) {
  if (caller.viewingTenantId != null && caller.viewingTenantId !== caller.tenantId) throw new HTTPException(409, { message: '平台查看模式不能代他人申请，请切换至所属租户的真实账号' });
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
    if (request.provisionStatus === 'succeeded') {
      const existing = await tx.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.requestId, requestId), with: { user: true, approver: true, revoker: true, menus: true } });
      return existing ? formatAccessGrant(existing) : null;
    }
    if (request.status !== 'approved' || request.provisionStatus === 'terminated') return null;
    if (!request.workflowInstanceId || (expected && expected.workflowInstanceId !== request.workflowInstanceId)) throw new Error('权限申请流程关联无效');
    const workflow = await tx.query.workflowInstances.findFirst({ where: and(eq(workflowInstances.id, request.workflowInstanceId), exactTenantCondition(workflowInstances.tenantId, request.tenantId)), columns: { status: true, bizType: true, bizId: true } });
    if (workflow?.status !== 'approved' || workflow.bizType !== ACCESS_REQUEST_BIZ_TYPE || workflow.bizId !== String(request.id)) throw new Error('权限申请尚未获得有效的流程批准');
    await assertAccessSnapshotDuration(request.policySnapshot, request.startsAt, request.expiresAt, request.tenantId, tx);
    const approvers = new Set(request.approvalEvidence.map(evidence => evidence.actorId));
    if (approvers.has(request.targetUserId) || approvers.size !== request.approvalEvidence.length || request.approvalPlan.steps.some(step => !request.approvalEvidence.some(evidence => evidence.nodeKey === step.nodeKey && (!request.approvalPlan.mfaRequired || evidence.mfaVerifiedAt !== null)))) throw new HTTPException(409, { message: '权限审批计划尚未完整履行' });
    await assertAccessGrantApproversCurrent(tx, request);
    const target = await tx.query.users.findFirst({ where: and(eq(users.id, request.targetUserId), exactTenantCondition(users.tenantId, request.tenantId), eq(users.status, 'enabled')), columns: { id: true, nickname: true, username: true } });
    if (!target) throw new HTTPException(409, { message: '权限申请受益用户已经停用' });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`identity-access:${request.tenantId ?? 'platform'}:${request.targetUserId}`}, 0))`);
    await assertNoOverlappingAccessRequest({ targetUserId: request.targetUserId, tenantId: request.tenantId, startsAt: request.startsAt, expiresAt: request.expiresAt, items: request.items, excludeRequestId: request.id }, tx);
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
    const menuItems = mergeAccessPermissionItems(request.items).map(item => {
      const policy = request.policySnapshot.find(snapshot => snapshot.permissionCode === item.permissionCode);
      if (!policy) throw new Error('授权项缺少对应的策略快照');
      return { ...item, grantId: grant.id, status, startsAt: request.startsAt, expiresAt: request.expiresAt, policySnapshot: policy,
        nextReviewAt: policy.reviewIntervalDays > 0 ? new Date(now.getTime() + policy.reviewIntervalDays * 86_400_000) : null };
    });
    if (menuItems.length > 0) await tx.insert(identityAccessGrantMenus).values(menuItems).onConflictDoNothing();
    await tx.update(identityAccessRequests).set({ status: 'approved', provisionStatus: 'succeeded', approvedAt: request.approvedAt ?? now, appliedAt: now, failureReason: null }).where(eq(identityAccessRequests.id, request.id));
    await notifyWithin(tx, 'identity.access.approved', { recipients: [{ type: 'user', id: target.id }], vars: { requestId: request.id, targetName: target.nickname || target.username, startsAt: formatDateTime(request.startsAt), expiresAt: formatDateTime(request.expiresAt) }, tenantId: request.tenantId, link: `/workflow/instance/${request.workflowInstanceId}`, dedupeKey: `identity-access-approved:${request.id}` });
    const applied = await tx.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.id, grant.id), with: { user: true, approver: true, revoker: true, menus: true } });
    return applied ? formatAccessGrant(applied) : null;
  });
  const grantUserId = result?.userId;
  if (grantUserId) await notifyUserPermissionsChanged(grantUserId);
  return result;
}

export async function listAccessGrants(q: QueryOutputOf<typeof accessGovernanceContract.grantList>, mine = false) {
  const user = currentUser();
  const now = new Date();
  const live = inArray(identityAccessGrants.status, ['scheduled', 'active']);
  const statusWhere = q.status === 'revoked' ? eq(identityAccessGrants.status, 'revoked')
    : q.status === 'expired' ? or(eq(identityAccessGrants.status, 'expired'), and(live, lte(identityAccessGrants.expiresAt, now)))
    : q.status === 'scheduled' ? and(live, gt(identityAccessGrants.startsAt, now), gt(identityAccessGrants.expiresAt, now))
    : q.status === 'active' ? and(live, lte(identityAccessGrants.startsAt, now), gt(identityAccessGrants.expiresAt, now)) : undefined;
  const where = buildWhere(
    mine ? undefined : tenantCondition(identityAccessGrants, user),
    q.keyword ? or(exists(db.select({ id: users.id }).from(users).where(and(eq(users.id, identityAccessGrants.userId), keywordCondition(q.keyword, [users.username, users.nickname])))),
      exists(db.select({ id: identityAccessGrantMenus.id }).from(identityAccessGrantMenus).where(and(eq(identityAccessGrantMenus.grantId, identityAccessGrants.id), keywordCondition(q.keyword, [identityAccessGrantMenus.permissionCode, identityAccessGrantMenus.permissionLabel]))))) : undefined,
    statusWhere,
    q.riskLevel ? eq(identityAccessGrants.riskLevel, q.riskLevel) : undefined,
    mine ? eq(identityAccessGrants.userId, user.userId) : q.userId ? eq(identityAccessGrants.userId, q.userId) : undefined,
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

export async function listPermissionPolicies(q: QueryOutputOf<typeof accessGovernanceContract.policyList>) {
  const tenantId = getCreateTenantId(currentUser());
  const entries = await readAccessPolicySet(Object.keys(ALL_PERMISSIONS), tenantId);
  const keyword = q.keyword?.toLowerCase();
  // 该视图由有界的代码目录与租户覆盖组合，筛选必须针对最终生效值。
  const rows = entries.map(({ policy, record }) => formatPermissionPolicy(policy, record, tenantId)).filter(row => (!keyword || row.permissionCode.toLowerCase().includes(keyword)) && (!q.riskLevel || row.riskLevel === q.riskLevel) && (!q.approvalPolicy || row.approvalPolicy === q.approvalPolicy));
  return buildListResult({ page: q.page, pageSize: q.pageSize, count: async () => rows.length, rows: async () => rows.slice(pageOffset(q.page, q.pageSize), pageOffset(q.page, q.pageSize) + q.pageSize) });
}

export async function updatePermissionPolicy(permissionCode: string, input: UpdatePermissionPolicyInput): Promise<PermissionPolicy> {
  assertPermissionPolicyUpdate(permissionCode, input);
  const tenantId = getCreateTenantId(currentUser());
  const [previous] = await readAccessPolicySet([permissionCode], tenantId);
  setAuditBefore(formatPermissionPolicy(previous.policy, previous.record, tenantId));
  const [saved] = await db.insert(identityPermissionPolicies).values({ permissionCode, tenantId, ...input })
    .onConflictDoUpdate({ target: [identityPermissionPolicies.permissionCode, identityPermissionPolicies.tenantId],
      set: { ...input, version: sql`${identityPermissionPolicies.version} + 1`, updatedAt: new Date() },
      setWhere: sql`row(${identityPermissionPolicies.riskLevel}, ${identityPermissionPolicies.approvalPolicy}, ${identityPermissionPolicies.maxDurationMinutes}, ${identityPermissionPolicies.reviewIntervalDays}, ${identityPermissionPolicies.mfaRequired}, ${identityPermissionPolicies.enabled}) is distinct from row(${input.riskLevel}::identity_access_risk_level, ${input.approvalPolicy}::identity_access_approval_policy, ${input.maxDurationMinutes}::integer, ${input.reviewIntervalDays}::integer, ${input.mfaRequired}::boolean, ${input.enabled}::boolean)`,
    }).returning();
  const row = saved ?? requireRow(await db.query.identityPermissionPolicies.findFirst({ where: and(eq(identityPermissionPolicies.permissionCode, permissionCode), exactTenantCondition(identityPermissionPolicies.tenantId, tenantId)) }), '权限策略不存在');
  const baseline = accessPolicyBaseline(permissionCode, ALL_PERMISSIONS[permissionCode]);
  return formatPermissionPolicy(effectiveAccessPolicy(baseline, row), row, tenantId);
}

export async function getUserAccessOverview(userId: number) {
  await requireTenantUser(userId, '用户不存在');
  const [grants, reviews] = await Promise.all([
    db.query.identityAccessGrants.findMany({ where: and(eq(identityAccessGrants.userId, userId), tenantCondition(identityAccessGrants, currentUser())), with: { user: true, approver: true, revoker: true, menus: true }, orderBy: [desc(identityAccessGrants.createdAt)] }),
    db.query.identityAccessReviewItems.findMany({ where: and(eq(identityAccessReviewItems.userId, userId), tenantCondition(identityAccessReviewItems, currentUser())), with: { user: true }, orderBy: [desc(identityAccessReviewItems.createdAt)] }),
  ]);
  return { userId, grants: grants.map(formatAccessGrant), reviews: reviews.map(formatReviewItem) };
}

export async function reconcileAccessGovernance(): Promise<string> {
  const rows = await db.select({ id: workflowInstances.id, tenantId: workflowInstances.tenantId, bizType: workflowInstances.bizType, bizId: workflowInstances.bizId, status: workflowInstances.status, initiatorId: workflowInstances.initiatorId })
    .from(identityAccessRequests)
    .innerJoin(workflowInstances, eq(workflowInstances.id, identityAccessRequests.workflowInstanceId))
    .where(and(inArray(identityAccessRequests.status, ['pending', 'approved']), inArray(identityAccessRequests.provisionStatus, ['not_started', 'pending', 'running']), inArray(workflowInstances.status, ['approved', 'rejected', 'withdrawn', 'cancelled'])));
  const { bridgeAccessWorkflowOutcome } = await import('./access-workflow.service');
  for (const row of rows) await workflowTransaction(async (tx) => {
    await tx.select({ id: workflowInstances.id }).from(workflowInstances).where(eq(workflowInstances.id, row.id)).for('update');
    const approver = await tx.query.workflowTasks.findFirst({ where: and(eq(workflowTasks.instanceId, row.id), eq(workflowTasks.status, 'approved')), columns: { assigneeId: true }, orderBy: [desc(workflowTasks.actionAt), desc(workflowTasks.id)] });
    await bridgeAccessWorkflowOutcome(tx, row, approver?.assigneeId ?? null);
  });
  return `权限审批对账：核对 ${rows.length} 条，授权由可靠作业发放`;
}
