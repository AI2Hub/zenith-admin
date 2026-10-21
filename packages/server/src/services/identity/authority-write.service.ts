import { and, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Permission } from '@zenith/shared/core';
import { accessScopeKey } from '@zenith/shared/identity';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { users, roles, userRoles, roleMenus, menus, userGroups, userGroupRoles, userGroupMembers, identityRoleVersions, identityUserPermissions } from '../../db/schema';
import { currentUser } from '../../lib/context';
import { exactTenantCondition } from '../../lib/tenant';
import { getUserPermissions, runWithFreshUserPermissions } from '../../lib/permissions';
import { loadEffectiveAccessPolicies } from './access-policy.service';
import { getDataScopeCondition } from '../../lib/data-scope';

/** All authority writers use the same tenant lock, including automatic provisioning. */
export async function lockIdentityAuthority(tx: DbExecutor, tenantId: number | null) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`identity-authority:${tenantId ?? 'platform'}`}, 0))`);
}

export async function assertAuthorityActor(tx: DbExecutor, tenantId: number | null, permission: Permission, beneficiaryIds: readonly number[] = [], allowSelf = false) {
  await lockIdentityAuthority(tx, tenantId);
  const actor = currentUser();
  const account = await tx.query.users.findFirst({
    where: and(eq(users.id, actor.userId), eq(users.status, 'enabled')),
    columns: { id: true, tenantId: true },
    with: { userRoles: { with: { role: { columns: { code: true, status: true, tenantId: true } } } } },
  });
  if (!account) throw new HTTPException(403, { message: '当前身份已失效，不能修改权限' });
  const platform = account.tenantId === null && account.userRoles.some(({ role }) => role.code === 'super_admin' && role.tenantId === null && role.status === 'enabled');
  if (!platform && account.tenantId !== tenantId) throw new HTTPException(403, { message: '不能跨租户修改身份权限' });
  const canManageOwnOrganization = platform && permission === 'system:user:organization';
  if (!allowSelf && !canManageOwnOrganization && beneficiaryIds.includes(actor.userId)) throw new HTTPException(403, { message: '不能通过管理操作改变自己的授权或组织归属，请由独立管理员办理' });
  const owned = await runWithFreshUserPermissions(actor.userId, () => getUserPermissions(actor.userId), tx);
  if (!platform && !owned.includes(permission)) throw new HTTPException(403, { message: '没有当前权限变更的管理能力' });
  if (beneficiaryIds.length) {
    const scope = platform ? undefined : await getDataScopeCondition({ currentUserId: actor.userId, permissions: [permission], executor: tx, deptColumn: users.departmentId, ownerColumn: users.id });
    const ids = [...new Set(beneficiaryIds)];
    const targets = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), exactTenantCondition(users.tenantId, tenantId), scope));
    if (targets.length !== ids.length) throw new HTTPException(403, { message: '受益用户超出当前管理范围' });
  }
  return { platform, owned };
}

/** Profile changes permit self editing, but still require a live, current capability. */
export async function assertProfileActor(tx: DbExecutor, tenantId: number | null, userId: number) {
  return assertAuthorityActor(tx, tenantId, 'system:user:update', [userId], true);
}

export async function assertGrantableRoles(tx: DbExecutor, roleIds: readonly number[], tenantId: number | null) {
  const ids = [...new Set(roleIds)];
  if (!ids.length) return [];
  const rows = await tx.query.roles.findMany({ where: and(inArray(roles.id, ids), exactTenantCondition(roles.tenantId, tenantId), eq(roles.status, 'enabled')),
    with: { roleMenus: { with: { menu: true } } } });
  if (rows.length !== ids.length) throw new HTTPException(400, { message: '角色不存在、已停用或不属于目标租户' });
  return rows;
}

/** A role code alone is never sufficient to authorize automated onboarding. */
export async function assertAutomaticRolesAllowed(tx: DbExecutor, roleIds: readonly number[], tenantId: number | null) {
  await lockIdentityAuthority(tx, tenantId);
  const rows = await assertGrantableRoles(tx, roleIds, tenantId);
  if (rows.some(role => ['super_admin', 'tenant_admin', 'security_admin'].includes(role.code))) throw new HTTPException(403, { message: '自动配置不允许授予管理身份' });
  const codes = [...new Set(rows.flatMap(role => role.permissionCodes))];
  const policies = await loadEffectiveAccessPolicies(codes, tenantId, tx);
  if (policies.some(policy => policy.riskLevel !== 'low' || !policy.enabled || policy.mfaRequired)) throw new HTTPException(403, { message: '自动配置仅允许审定的基础权限，高危或治理能力须独立授予' });
  return rows;
}

export async function assertAuthorityGrant(tx: DbExecutor, input: { tenantId: number | null; permission: Permission; beneficiaryIds?: readonly number[]; roleIds?: readonly number[]; menuIds?: readonly number[]; allowSelf?: boolean }) {
  const actor = await assertAuthorityActor(tx, input.tenantId, input.permission, input.beneficiaryIds, input.allowSelf);
  const roleRows = await assertGrantableRoles(tx, input.roleIds ?? [], input.tenantId);
  const ids = [...new Set(input.menuIds ?? [])];
  const menuRows = ids.length ? await tx.select().from(menus).where(inArray(menus.id, ids)) : [];
  if (menuRows.length !== ids.length || menuRows.some(menu => menu.status !== 'enabled')) throw new HTTPException(400, { message: '存在无效或停用的菜单' });
  const codes = [...new Set([...menuRows.flatMap(menu => menu.permission ? [menu.permission] : []), ...roleRows.flatMap(role => role.permissionCodes)])];
  for (const code of codes) if (!ALL_PERMISSIONS[code]) throw new HTTPException(400, { message: `权限目录未登记 ${code}` });
  const policies = await loadEffectiveAccessPolicies(codes, input.tenantId, tx);
  if (!actor.platform) {
    if (roleRows.some(role => ['super_admin', 'tenant_admin', 'security_admin'].includes(role.code))) throw new HTTPException(403, { message: '管理身份只能由平台管理员任命' });
    if (policies.some(policy => policy.riskLevel !== 'low' || !policy.enabled)) throw new HTTPException(409, { message: '高危或治理能力不能通过普通直授获得，请使用独立审批或管理员任命' });
    if (codes.some(code => !actor.owned.includes(code))) throw new HTTPException(403, { message: '所授予的能力超出当前管理员可委派范围' });
  }
}

export async function roleBeneficiaries(tx: DbExecutor, roleId: number): Promise<number[]> {
  const direct = await tx.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, roleId));
  const grouped = await tx.select({ id: userGroupMembers.userId }).from(userGroupRoles)
    .innerJoin(userGroupMembers, eq(userGroupMembers.groupId, userGroupRoles.groupId)).where(eq(userGroupRoles.roleId, roleId));
  return [...new Set([...direct, ...grouped].map(row => row.id))];
}

export async function replaceUserRoles(tx: DbExecutor, userId: number, roleIds: readonly number[], tenantId: number | null) {
  await lockIdentityAuthority(tx, tenantId);
  const previous = await tx.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  const added = roleIds.filter(id => !previous.some(row => row.roleId === id));
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:user:assign', beneficiaryIds: [userId], roleIds: added, allowSelf: !added.length });
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length) await tx.insert(userRoles).values([...new Set(roleIds)].map(roleId => ({ userId, roleId })));
}

export async function replaceRolePermissions(tx: DbExecutor, roleId: number, menuIds: readonly number[], tenantId: number | null) {
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:role:assign', beneficiaryIds: await roleBeneficiaries(tx, roleId), menuIds });
  await tx.delete(roleMenus).where(eq(roleMenus.roleId, roleId));
  if (menuIds.length) await tx.insert(roleMenus).values([...new Set(menuIds)].map(menuId => ({ roleId, menuId })));
  const rows = menuIds.length ? await tx.select({ code: menus.permission }).from(menus).where(inArray(menus.id, [...menuIds])) : [];
  await publishRoleVersion(tx, roleId, rows.flatMap(row => row.code ? [row.code] : []));
}

export async function publishRoleVersion(tx: DbExecutor, roleId: number, codes?: readonly string[]) {
  const role = await tx.query.roles.findFirst({ where: eq(roles.id, roleId), with: { deptScopes: true } });
  if (!role) throw new HTTPException(404, { message: '角色不存在' });
  await lockIdentityAuthority(tx, role.tenantId);
  const permissionCodes = [...new Set(codes ?? role.permissionCodes)].sort();
  const deptScopeIds = role.deptScopes.map(item => item.deptId).sort((a, b) => a - b);
  accessScopeKey(role.dataScope, deptScopeIds);
  const old = await tx.query.identityRoleVersions.findFirst({ where: and(eq(identityRoleVersions.roleId, roleId), eq(identityRoleVersions.version, role.permissionVersion)) });
  const snapshot = { permissionCodes, dataScope: role.dataScope, deptScopeIds };
  const changed = old && JSON.stringify({ permissionCodes: old.permissionCodes, dataScope: old.dataScope, deptScopeIds: old.deptScopeIds }) !== JSON.stringify(snapshot);
  const version = role.permissionVersion + (changed ? 1 : 0);
  await tx.insert(identityRoleVersions).values({ roleId, version, ...snapshot }).onConflictDoNothing();
  await tx.update(roles).set({ permissionCodes, permissionVersion: version }).where(eq(roles.id, roleId));
}

export async function replaceDirectPermissions(tx: DbExecutor, userId: number, menuIds: readonly number[], tenantId: number | null) {
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:user:assign', beneficiaryIds: [userId], menuIds });
  const rows = menuIds.length ? await tx.select({ code: menus.permission }).from(menus).where(inArray(menus.id, [...menuIds])) : [];
  const codes = [...new Set(rows.flatMap(row => row.code ? [row.code] : []))];
  await tx.delete(identityUserPermissions).where(eq(identityUserPermissions.userId, userId));
  if (codes.length) await tx.insert(identityUserPermissions).values(codes.map(permissionCode => ({ userId, permissionCode, dataScope: 'self' as const, deptScopeIds: [], scopeKey: accessScopeKey('self', []) })));
}

export async function replaceRoleMembers(tx: DbExecutor, roleId: number, userIds: readonly number[], tenantId: number | null) {
  await lockIdentityAuthority(tx, tenantId);
  const previous = await tx.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, roleId));
  const added = userIds.filter(id => !previous.some(row => row.userId === id));
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:role:assign', beneficiaryIds: added, roleIds: added.length ? [roleId] : [] });
  await tx.delete(userRoles).where(eq(userRoles.roleId, roleId));
  if (userIds.length) await tx.insert(userRoles).values([...new Set(userIds)].map(userId => ({ roleId, userId })));
}

export async function replaceGroupRoleBindings(tx: DbExecutor, groupId: number, roleIds: readonly number[], tenantId: number | null) {
  await lockIdentityAuthority(tx, tenantId);
  const group = await tx.query.userGroups.findFirst({ where: and(eq(userGroups.id, groupId), exactTenantCondition(userGroups.tenantId, tenantId)), columns: { memberMode: true } });
  if (!group) throw new HTTPException(404, { message: '用户组不存在' });
  const members = await tx.select({ id: userGroupMembers.userId }).from(userGroupMembers).where(eq(userGroupMembers.groupId, groupId));
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:user-groups:assign', beneficiaryIds: members.map(row => row.id), roleIds });
  if (group.memberMode === 'dynamic') await assertAutomaticRolesAllowed(tx, roleIds, tenantId);
  await tx.delete(userGroupRoles).where(eq(userGroupRoles.groupId, groupId));
  if (roleIds.length) await tx.insert(userGroupRoles).values([...new Set(roleIds)].map(roleId => ({ groupId, roleId })));
}

export async function replaceGroupMemberBindings(tx: DbExecutor, groupId: number, userIds: readonly number[], tenantId: number | null) {
  await lockIdentityAuthority(tx, tenantId);
  const before = await tx.select({ id: userGroupMembers.userId }).from(userGroupMembers).where(eq(userGroupMembers.groupId, groupId));
  const added = userIds.filter(id => !before.some(row => row.id === id));
  const bindings = await tx.select({ roleId: userGroupRoles.roleId }).from(userGroupRoles).where(eq(userGroupRoles.groupId, groupId));
  await assertAuthorityGrant(tx, { tenantId, permission: 'system:user-groups:assign', beneficiaryIds: added, roleIds: added.length ? bindings.map(row => row.roleId) : [] });
  await tx.delete(userGroupMembers).where(eq(userGroupMembers.groupId, groupId));
  if (userIds.length) await tx.insert(userGroupMembers).values([...new Set(userIds)].map(userId => ({ groupId, userId })));
}

export async function provisionUserRoles(tx: DbExecutor, userId: number, roleIds: readonly number[], tenantId: number | null) {
  await assertAutomaticRolesAllowed(tx, roleIds, tenantId);
  if (roleIds.length) await tx.insert(userRoles).values([...new Set(roleIds)].map(roleId => ({ userId, roleId }))).onConflictDoNothing();
}

export async function provisionBasicUser(tx: DbExecutor, userId: number, tenantId: number | null) {
  const role = await tx.query.roles.findFirst({ where: and(eq(roles.code, 'user'), exactTenantCondition(roles.tenantId, tenantId), eq(roles.status, 'enabled')), columns: { id: true } });
  if (role) await provisionUserRoles(tx, userId, [role.id], tenantId);
}

export async function assertAutomaticGroupMembership(tx: DbExecutor, groupId: number, tenantId: number | null) {
  const bindings = await tx.select({ roleId: userGroupRoles.roleId }).from(userGroupRoles).where(eq(userGroupRoles.groupId, groupId));
  await assertAutomaticRolesAllowed(tx, bindings.map(row => row.roleId), tenantId);
}

/** A read helper for the command UI; all writes recheck inside their transaction. */
export async function getRoleBeneficiaries(roleId: number) {
  return roleBeneficiaries(db, roleId);
}
