import { OpenAPIHono } from '@hono/zod-openapi';
import { userGroupContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, conflictResponse, okBody } from '../../lib/openapi-schemas';
import { defineScopeMembersRoute } from './_scope-members';
import {
  listAllUserGroups,
  listUserGroups,
  getUserGroup,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  batchDeleteUserGroups,
  getUserGroupsBeforeAudit,
  listGroupMembers,
  setGroupMembers,
  addGroupMembers,
  removeGroupMembers,
  getUserGroupMembersBeforeAudit,
  listGroupRoles,
  setGroupRoles,
  getUserGroupRolesBeforeAudit,
  previewUserGroupRule,
  syncUserGroupNow,
} from '../../services/identity/user-groups.service';
import { mountCrud } from '../_crud';

const memberPreviewRoute = defineScopeMembersRoute({
  op: userGroupContract.memberPreview,
  scopeType: 'userGroup',
  permission: 'system:user-groups:list',
});

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:user-groups:list' })] as const;

const allRoute = defineContractRoute(userGroupContract.all, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listAllUserGroups()), 200),
});
const batchDeleteRoute = defineContractRoute(userGroupContract.removeBatch, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:delete', audit: { description: '批量删除用户组', module: '用户组管理' } })] as const,
  responses: conflictResponse,
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const before = await getUserGroupsBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const { count } = await batchDeleteUserGroups(ids);
    return c.json(okBody(null, `已删除 ${count} 个用户组`), 200);
  },
});
const listMembersRoute = defineContractRoute(userGroupContract.members, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listGroupMembers(c.req.valid('param').id)), 200),
});

const setMembersRoute = defineContractRoute(userGroupContract.setMembers, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:assign', audit: { description: '设置用户组成员', module: '用户组管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const before = await getUserGroupMembersBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await setGroupMembers(id, userIds);
    const after = await getUserGroupMembersBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

const addMembersRoute = defineContractRoute(userGroupContract.addMembers, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:assign', audit: { description: '添加用户组成员', module: '用户组管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const before = await getUserGroupMembersBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await addGroupMembers(id, userIds);
    const after = await getUserGroupMembersBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '添加成功'), 200);
  },
});

const removeMembersRoute = defineContractRoute(userGroupContract.removeMembers, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:assign', audit: { description: '移除用户组成员', module: '用户组管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const before = await getUserGroupMembersBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await removeGroupMembers(id, userIds);
    const after = await getUserGroupMembersBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '移除成功'), 200);
  },
});

const listGroupRolesRoute = defineContractRoute(userGroupContract.roles, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listGroupRoles(c.req.valid('param').id)), 200),
});

const setGroupRolesRoute = defineContractRoute(userGroupContract.setRoles, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:assign', audit: { description: '分配用户组角色', module: '用户组管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { roleIds } = c.req.valid('json');
    const before = await getUserGroupRolesBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await setGroupRoles(id, roleIds);
    const after = await getUserGroupRolesBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

const rulePreviewRoute = defineContractRoute(userGroupContract.rulePreview, {
  middleware: [authMiddleware, guard({ permission: ['system:user-groups:create', 'system:user-groups:update'] })] as const,
  handler: async (c) => c.json(okBody(await previewUserGroupRule(c.req.valid('json'))), 200),
});

const syncRoute = defineContractRoute(userGroupContract.sync, {
  middleware: [authMiddleware, guard({ permission: 'system:user-groups:assign', audit: { description: '手动同步动态组成员', module: '用户组管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { added, removed } = await syncUserGroupNow(id);
    return c.json(okBody(null, `同步完成：加入 ${added} 人，移除 ${removed} 人`), 200);
  },
});

mountCrud(router, userGroupContract,
  {
    list: listUserGroups,
    get: getUserGroup,
    create: createUserGroup,
    update: updateUserGroup,
    remove: deleteUserGroup,
  },
  {
    permission: 'system:user-groups',
    label: '用户组',
    exclude: ['removeBatch'],
    responses: { remove: conflictResponse },
  },
  [
    allRoute,
    rulePreviewRoute,
    listMembersRoute,
    memberPreviewRoute,
    setMembersRoute,
    addMembersRoute,
    removeMembersRoute,
    listGroupRolesRoute,
    setGroupRolesRoute,
    syncRoute,
    batchDeleteRoute,
  ],
);

export default router;
