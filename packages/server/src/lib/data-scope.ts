import { eq, inArray, or, type SQL, type AnyColumn } from 'drizzle-orm';
import { currentOperationPermissions } from './context';
import { db } from '../db';
import type { DbExecutor } from '../db/types';
import { departments, users } from '../db/schema';
import { enabledGroupRolesWith, extractEnabledGroupRoles } from './user-group-access';

export interface DataScopeOptions {
  /** Reuse the caller's transaction instead of acquiring another pool connection. */
  executor?: DbExecutor;
  /** 当前登录用户 ID */
  currentUserId: number;
  /** 后台任务可显式指定能力；HTTP 请求默认使用已经通过门禁的操作权限。 */
  permissions?: readonly string[];
  /**
   * 目标业务表中存放部门 ID 的列（如 orders.departmentId）。
   * dept 权限生效时用于过滤。
   * 若不传，dept 权限将降级为 self 处理。
   */
  deptColumn?: AnyColumn;
  /**
   * 目标业务表中标识数据归属人的列（如 orders.createdBy 或 users.id）。
   * self 权限生效时用于过滤。
   * 受限数据范围无法构造条件时抛错，禁止省略条件后放行。
   */
  ownerColumn?: AnyColumn;
}

/**
 * 计算当前用户的数据权限过滤条件。
 *
 * 使用方式：
 * ```ts
 * const scopeWhere = await getDataScopeCondition({
 *   currentUserId,
 *   deptColumn: orders.departmentId,
 *   ownerColumn: orders.createdBy,
 * });
 * const where = scopeWhere ? and(baseCondition, scopeWhere) : baseCondition;
 * ```
 *
 * - 返回 `undefined`：当前用户有全量数据访问权限，不需要追加任何条件。
 * - 返回 SQL 条件：需要追加到 WHERE 子句。
 */
export async function getDataScopeCondition(options: DataScopeOptions): Promise<SQL | undefined> {
  const { currentUserId, deptColumn, ownerColumn, executor = db } = options;
  const permissionCodes = options.permissions ?? currentOperationPermissions();

  // ── 1. 查询用户的角色（含 dataScope 和 deptScopes）及部门，合并为单次 RQB 请求 ──────────────
  const userData = await executor.query.users.findFirst({
    where: eq(users.id, currentUserId),
    columns: { departmentId: true, userDataScope: true },
    with: {
      userRoles: {
        columns: {},
        with: {
          role: {
            columns: { dataScope: true, code: true, tenantId: true, status: true },
            with: { deptScopes: { columns: { deptId: true } }, roleMenus: { columns: {}, with: { menu: { columns: { permission: true, status: true } } } } },
          },
        },
      },
      // 用户组绑定的角色：组内成员继承其数据权限（仅启用组的启用角色生效，口径见 user-group-access）
      userGroupMembers: enabledGroupRolesWith({
        columns: { dataScope: true, code: true, tenantId: true, status: true },
        with: { deptScopes: { columns: { deptId: true } }, roleMenus: { columns: {}, with: { menu: { columns: { permission: true, status: true } } } } },
      }),
      userDeptScopes: { columns: { deptId: true } },
      accessGrants: { columns: { status: true, startsAt: true, expiresAt: true }, with: { menus: { columns: { permissionCode: true, dataScope: true, deptScopeIds: true, status: true, startsAt: true, expiresAt: true }, with: { menu: { columns: { permission: true, status: true } } } } } },
    },
  });
  const now = new Date();
  const activeGrantScopes = (userData?.accessGrants ?? []).filter(grant =>
    ['scheduled', 'active'].includes(grant.status) && grant.startsAt <= now && grant.expiresAt > now,
  ).flatMap(grant => grant.menus.filter(item => ['scheduled', 'active'].includes(item.status) && item.startsAt <= now && item.expiresAt > now && item.menu.status === 'enabled' && item.menu.permission === item.permissionCode && permissionCodes.includes(item.permissionCode)));

  // 禁用角色的数据权限不再生效（与功能权限解析同一口径）
  const directRoleList = (userData?.userRoles.map((ur) => ur.role) ?? []).filter((r) => r.status === 'enabled');
  const groupRoleList = extractEnabledGroupRoles(userData?.userGroupMembers).roles;
  const allRoles = [...directRoleList, ...groupRoleList];
  const userRoleList = allRoles.filter(role => !permissionCodes.length || role.roleMenus.some(({ menu }) => menu.status === 'enabled' && menu.permission !== null && permissionCodes.includes(menu.permission)));
  const userDirectScope = userData?.userDataScope ?? null;

  // ── 2. 计算有效权限（多角色 + 用户直接权限取最宽松原则）─────────────────────────────────────
  // 平台超管须双条件判定（code + 平台角色），防止租户自建 super_admin 伪造全量数据权限
  const isSuperAdmin = allRoles.some((r) => r.code === 'super_admin' && r.tenantId === null);
  const scopeSet = new Set(userRoleList.map((r) => r.dataScope));
  if (userDirectScope !== null) scopeSet.add(userDirectScope);
  for (const grant of activeGrantScopes) {
    if (grant.dataScope !== null) scopeSet.add(grant.dataScope);
  }

  if (isSuperAdmin || scopeSet.has('all')) {
    return undefined; // 全量访问，不追加条件
  }

  const conditions: SQL[] = [];
  let includeSelf = scopeSet.has('self') || scopeSet.size === 0;
  if (scopeSet.has('dept')) {
    if (deptColumn && userData?.departmentId) {
      const allDepts = await executor.select({ id: departments.id, parentId: departments.parentId }).from(departments);
      conditions.push(inArray(deptColumn, collectDescendants(allDepts, userData.departmentId)));
    } else includeSelf = true;
  }
  if (scopeSet.has('custom')) {
    const roleIds = userRoleList.filter(role => role.dataScope === 'custom').flatMap(role => role.deptScopes.map(scope => scope.deptId));
    const directIds = userDirectScope === 'custom' ? (userData?.userDeptScopes?.map(scope => scope.deptId) ?? []) : [];
    const grantIds = activeGrantScopes.filter(grant => grant.dataScope === 'custom').flatMap(grant => grant.deptScopeIds);
    const ids = [...new Set([...roleIds, ...directIds, ...grantIds])];
    if (deptColumn && ids.length) conditions.push(inArray(deptColumn, ids));
    else includeSelf = true;
  }
  if (scopeSet.has('dept_only')) {
    if (deptColumn && userData?.departmentId) conditions.push(eq(deptColumn, userData.departmentId));
    else includeSelf = true;
  }
  if (includeSelf && ownerColumn) conditions.push(eq(ownerColumn, currentUserId));
  if (includeSelf && !ownerColumn) throw new Error('Restricted data scope requires an owner column');
  if (!conditions.length) throw new Error('Restricted data scope requires an owner column');
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

/**
 * 从部门平铺列表中，收集指定部门及其所有后代部门的 ID。
 */
function collectDescendants(
  allDepts: { id: number; parentId: number }[],
  rootId: number,
): number[] {
  const result: number[] = [rootId];
  const queue: number[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const dept of allDepts) {
      if (dept.parentId === current) {
        result.push(dept.id);
        queue.push(dept.id);
      }
    }
  }
  return result;
}
