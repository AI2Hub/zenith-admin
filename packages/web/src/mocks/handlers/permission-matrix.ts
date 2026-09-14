import { permissionMatrixContract, type RolePermissionSet, type UserPermissionSet } from '@zenith/shared/identity';
import { SEED_MENUS } from '@zenith/shared/seed';
import { mock } from '@/mocks/utils/contract';
import { requireItem } from '@/mocks/utils/crud';
import { mockRoles } from '@/mocks/data/roles';
import { mockUsers } from '@/mocks/data/users';

/** 角色绑定的启用按钮菜单 → 权限码（与服务端 permissionsOfMenus 同口径，Demo 不区分套餐） */
function permissionsOfMenuIds(menuIds: readonly number[]): string[] {
  const ids = new Set(menuIds);
  const codes = SEED_MENUS
    .filter((menu) => ids.has(menu.id) && menu.status === 'enabled' && menu.permission)
    .map((menu) => menu.permission as string);
  return [...new Set(codes)].sort();
}

function toRoleSet(role: typeof mockRoles[number]): RolePermissionSet {
  const superAdmin = role.code === 'super_admin';
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    status: role.status,
    tenantId: null,
    superAdmin,
    permissions: superAdmin ? [] : permissionsOfMenuIds(role.menuIds ?? []),
  };
}

export const permissionMatrixHandlers = [
  mock(permissionMatrixContract.roles, ({ ok }) => ok(mockRoles.map(toRoleSet))),
  mock(permissionMatrixContract.user, ({ params, ok }) => {
    const user = requireItem(mockUsers, params.id, '用户不存在', { status: 404 });
    const roles = user.roles.map((r) => mockRoles.find((m) => m.id === r.id) ?? r);
    const superAdmin = roles.some((r) => r.code === 'super_admin');
    const set: UserPermissionSet = {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      status: user.status,
      tenantId: user.tenantId ?? null,
      superAdmin,
      roles: roles.map(({ id, name, code }) => ({ id, name, code })),
      permissions: superAdmin ? [] : [...new Set(roles.flatMap((r) => permissionsOfMenuIds(r.menuIds ?? [])))].sort(),
    };
    return ok(set);
  }),
];
