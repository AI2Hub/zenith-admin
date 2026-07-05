import { http, HttpResponse } from 'msw';
import { mockUsers } from '@/mocks/data/users';
import { mockRoles } from '@/mocks/data/roles';
import { mockUserGroups } from '@/mocks/data/user-groups';

// In-memory store for user-level menu/data permissions
const userMenuMap: Record<number, number[]> = {};
const userDataScopeMap: Record<number, string | null> = {};
const userDeptScopeMap: Record<number, number[]> = {};

const SCOPE_PRIORITY: Record<string, number> = { all: 5, dept: 4, dept_only: 3, custom: 2, self: 1 };

function getMostPermissive(scopes: Array<string | null>): string | null {
  const valid = scopes.filter((s): s is string => s !== null);
  if (valid.length === 0) return null;
  return valid.reduce((best, curr) => (SCOPE_PRIORITY[curr] ?? 0) > (SCOPE_PRIORITY[best] ?? 0) ? curr : best, valid[0]);
}

/** 用户所在启用用户组继承的角色/菜单/数据权限 */
function getGroupInheritance(userId: number) {
  const memberGroups = mockUserGroups.filter((g) => g.status === 'enabled' && g.memberIds.includes(userId));
  const groupRoles = memberGroups
    .flatMap((g) => g.roleIds)
    .map((rid) => mockRoles.find((r) => r.id === rid))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const groupMenuIds = [...new Set(groupRoles.flatMap((r) => r.menuIds ?? []))];
  const groupDataScope = getMostPermissive(groupRoles.map((r) => r.dataScope ?? null));
  const groupDeptScopeIds = [...new Set(
    groupRoles.filter((r) => r.dataScope === 'custom').flatMap((r) => r.deptScopeIds ?? [])
  )];
  const groups = memberGroups.filter((g) => g.roleIds.length > 0).map((g) => ({ id: g.id, name: g.name }));
  return { groupMenuIds, groupDataScope, groupDeptScopeIds, groups };
}

export const userPermissionsHandlers = [
  // GET /api/users/:id/menus — 用户菜单权限
  http.get('/api/users/:id/menus', ({ params }) => {
    const userId = Number(params.id);
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) return HttpResponse.json({ code: 404, message: '用户不存在', data: null });

    const directMenuIds = userMenuMap[userId] ?? [];
    const userRoleIds = (user as { roleIds?: number[] }).roleIds ?? [];
    const roleMenuIdSet = new Set<number>();
    for (const role of mockRoles.filter((r) => userRoleIds.includes(r.id))) {
      for (const id of (role.menuIds ?? [])) roleMenuIdSet.add(id);
    }
    return HttpResponse.json({
      code: 0, message: 'ok',
      data: { directMenuIds, roleMenuIds: [...roleMenuIdSet] },
    });
  }),

  // PUT /api/users/:id/menus — 分配用户菜单权限
  http.put('/api/users/:id/menus', async ({ params, request }) => {
    const userId = Number(params.id);
    const body = await request.json() as { menuIds: number[] };
    userMenuMap[userId] = body.menuIds ?? [];
    return HttpResponse.json({ code: 0, message: '保存成功', data: null });
  }),

  // GET /api/users/:id/data-permission — 用户数据权限
  http.get('/api/users/:id/data-permission', ({ params }) => {
    const userId = Number(params.id);
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) return HttpResponse.json({ code: 404, message: '用户不存在', data: null });

    const userRoleIds = (user as { roleIds?: number[] }).roleIds ?? [];
    const userRoles = mockRoles.filter((r) => userRoleIds.includes(r.id));
    const roleDataScope = getMostPermissive(userRoles.map((r) => r.dataScope ?? null));
    const roleDeptScopeIds = [...new Set(
      userRoles.filter((r) => r.dataScope === 'custom').flatMap((r) => r.deptScopeIds ?? [])
    )];
    const { groupDataScope, groupDeptScopeIds, groups } = getGroupInheritance(userId);

    return HttpResponse.json({
      code: 0, message: 'ok',
      data: {
        userDataScope: userDataScopeMap[userId] ?? null,
        deptScopeIds: userDeptScopeMap[userId] ?? [],
        roleDataScope,
        roleDeptScopeIds,
        groupDataScope,
        groupDeptScopeIds,
        groups,
      },
    });
  }),

  // PUT /api/users/:id/data-permission — 设置用户数据权限
  http.put('/api/users/:id/data-permission', async ({ params, request }) => {
    const userId = Number(params.id);
    const body = await request.json() as { dataScope: string | null; deptScopeIds: number[] };
    userDataScopeMap[userId] = body.dataScope ?? null;
    userDeptScopeMap[userId] = body.dataScope === 'custom' ? (body.deptScopeIds ?? []) : [];
    return HttpResponse.json({ code: 0, message: '保存成功', data: null });
  }),

  // GET /api/users/:id/effective-permissions — 最终有效权限
  http.get('/api/users/:id/effective-permissions', ({ params }) => {
    const userId = Number(params.id);
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) return HttpResponse.json({ code: 404, message: '用户不存在', data: null });

    const userRoleIds = (user as { roleIds?: number[] }).roleIds ?? [];
    const userRoles = mockRoles.filter((r) => userRoleIds.includes(r.id));
    const { groupMenuIds, groupDataScope, groupDeptScopeIds, groups } = getGroupInheritance(userId);

    const directMenuIds = userMenuMap[userId] ?? [];
    const roleMenuIds = [...new Set(userRoles.flatMap((r) => r.menuIds ?? []))];
    const effectiveMenuIds = [...new Set([...directMenuIds, ...roleMenuIds, ...groupMenuIds])];

    const userDataScope = userDataScopeMap[userId] ?? null;
    const roleDataScope = getMostPermissive(userRoles.map((r) => r.dataScope ?? null));
    const effectiveDataScope = getMostPermissive([userDataScope, roleDataScope, groupDataScope]) ?? 'self';

    const userDeptScopeIds = userDeptScopeMap[userId] ?? [];
    const roleDeptScopeIds = [...new Set(
      userRoles.filter((r) => r.dataScope === 'custom').flatMap((r) => r.deptScopeIds ?? [])
    )];
    const effectiveDeptScopeIds =
      effectiveDataScope === 'custom'
        ? [...new Set([...(userDataScope === 'custom' ? userDeptScopeIds : []), ...roleDeptScopeIds, ...groupDeptScopeIds])]
        : [];

    return HttpResponse.json({
      code: 0, message: 'ok',
      data: {
        directMenuIds,
        roleMenuIds,
        groupMenuIds,
        effectiveMenuIds,
        userDataScope,
        roleDataScope,
        groupDataScope,
        effectiveDataScope,
        userDeptScopeIds,
        roleDeptScopeIds,
        groupDeptScopeIds,
        effectiveDeptScopeIds,
        groups,
      },
    });
  }),
];
