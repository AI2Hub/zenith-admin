import { OpenAPIHono } from '@hono/zod-openapi';
import { userContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listAlertRecipientUsers,
  listAllUsers,
  listUsers,
  createUser,
  batchDeleteUsers,
  batchUpdateUserStatus,
  batchResetUsersPassword,
  updateUser,
  deleteUser,
  updateUserPassword,
  unlockUserById,
  getUserBeforeAudit,
  getUsersBeforeAudit,
  getUser,
  getUserMenuPermissions,
  assignUserMenus,
  getUserDataPermission,
  updateUserDataPermission,
  getUserEffectivePermissions,
  assignRolesToUser,
  getUserRoleAssignmentAudit,
  getUserMenuPermissionsBeforeAudit,
  getUserDataPermissionBeforeAudit,
} from '../../services/identity/users.service';
import { mountCrud } from '../_crud';

const usersRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:user:list' })] as const;
const assign = [authMiddleware, guard({ permission: 'system:user:assign' })] as const;

const getAllUsersRoute = defineContractRoute(userContract.all, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listAllUsers()), 200),
});

const getAlertRecipientUsersRoute = defineContractRoute(userContract.alertRecipients, {
  middleware: [authMiddleware, guard({ permission: ['alert:rule:create', 'alert:rule:update'] })] as const,
  handler: async (c) => c.json(okBody(await listAlertRecipientUsers()), 200),
});
const batchDeleteUsersRoute = defineContractRoute(userContract.removeBatch, {
  middleware: [authMiddleware, guard({ permission: 'system:user:delete', audit: { description: '批量删除用户', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const before = await getUsersBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const count = await batchDeleteUsers(ids);
    return c.json(okBody(null, `已删除 ${count} 个用户`), 200);
  },
});

const batchResetPasswordRoute = defineContractRoute(userContract.batchResetPassword, {
  middleware: [authMiddleware, guard({ permission: 'system:user:update', audit: { description: '批量重置用户密码', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { ids, password } = c.req.valid('json');
    await batchResetUsersPassword(ids, password);
    return c.json(okBody(null, '密码重置成功'), 200);
  },
});

const batchStatusUsersRoute = defineContractRoute(userContract.batchStatus, {
  middleware: [authMiddleware, guard({ permission: 'system:user:update', audit: { description: '批量修改用户状态', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { ids, status } = c.req.valid('json');
    const before = await getUsersBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    await batchUpdateUserStatus(ids, status);
    return c.json(okBody(null, '状态已更新'), 200);
  },
});

const updateUserPasswordRoute = defineContractRoute(userContract.resetPassword, {
  middleware: [authMiddleware, guard({ permission: 'system:user:update', audit: { description: '修改用户密码', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { password } = c.req.valid('json');
    const before = await getUserBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await updateUserPassword(id, password);
    return c.json(okBody(null, '密码修改成功'), 200);
  },
});

const unlockUserRoute = defineContractRoute(userContract.unlock, {
  middleware: [authMiddleware, guard({ permission: 'system:user:update', audit: { description: '解除账号锁定', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getUserBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await unlockUserById(id);
    return c.json(okBody(null, '解锁成功'), 200);
  },
});
const assignUserRolesRoute = defineContractRoute(userContract.assignRoles, {
  middleware: [authMiddleware, guard({ permission: 'system:user:assign', audit: { description: '分配用户角色', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { roleIds } = c.req.valid('json');
    const before = await getUserRoleAssignmentAudit(id);
    if (before) setAuditBeforeData(c, before);
    await assignRolesToUser(id, roleIds);
    const after = await getUserRoleAssignmentAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

const getUserMenusRoute = defineContractRoute(userContract.menus, {
  middleware: assign,
  handler: async (c) => c.json(okBody(await getUserMenuPermissions(c.req.valid('param').id)), 200),
});

const assignUserMenusRoute = defineContractRoute(userContract.assignMenus, {
  middleware: [authMiddleware, guard({ permission: 'system:user:assign', audit: { description: '分配用户菜单权限', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { menuIds } = c.req.valid('json');
    const before = await getUserMenuPermissionsBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await assignUserMenus(id, menuIds);
    const after = await getUserMenuPermissionsBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

const getUserDataPermissionRoute = defineContractRoute(userContract.dataPermission, {
  middleware: assign,
  handler: async (c) => c.json(okBody(await getUserDataPermission(c.req.valid('param').id)), 200),
});

const updateUserDataPermissionRoute = defineContractRoute(userContract.updateDataPermission, {
  middleware: [authMiddleware, guard({ permission: 'system:user:assign', audit: { description: '设置用户数据权限', module: '用户管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const before = await getUserDataPermissionBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await updateUserDataPermission(id, data);
    const after = await getUserDataPermissionBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

const getUserEffectivePermissionsRoute = defineContractRoute(userContract.effectivePermissions, {
  middleware: assign,
  handler: async (c) => c.json(okBody(await getUserEffectivePermissions(c.req.valid('param').id)), 200),
});

mountCrud(usersRouter, userContract,
  { list: listUsers, get: getUser, create: createUser, update: updateUser, remove: deleteUser },
  { permission: 'system:user', label: '用户', exclude: ['removeBatch'] },
  [
    getAlertRecipientUsersRoute,
    getAllUsersRoute,
    batchDeleteUsersRoute,
    batchStatusUsersRoute,
    batchResetPasswordRoute,
    updateUserPasswordRoute,
    unlockUserRoute,
    getUserMenusRoute,
    assignUserMenusRoute,
    assignUserRolesRoute,
    getUserDataPermissionRoute,
    updateUserDataPermissionRoute,
    getUserEffectivePermissionsRoute,
  ],
);

export default usersRouter;
