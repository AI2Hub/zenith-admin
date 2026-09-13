import { OpenAPIHono } from '@hono/zod-openapi';
import { menuContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { platformAdminOnly } from '../../middleware/platform-admin';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, conflictResponse, okBody } from '../../lib/openapi-schemas';
import {
  listUserMenuTree,
  listMenuTree,
  listMenusFlat,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  getMenuBeforeAudit,
  getMenuCascadeBeforeAudit,
} from '../../services/identity/menus.service';
import { mountCrud } from '../_crud';

const menusRouter = new OpenAPIHono({ defaultHook: validationHook });

// 多租户模式下菜单是平台级全局资源，写操作仅平台管理员可用
const platformOnly = platformAdminOnly({ message: '多租户模式下仅平台管理员可管理全局菜单', onlyInMultiTenant: true });

const userMenuRoute = defineContractRoute(menuContract.userTree, {
  middleware: [authMiddleware] as const,
  handler: async (c) => c.json(okBody(await listUserMenuTree()), 200),
});

const listRoute = defineContractRoute(menuContract.tree, {
  middleware: [authMiddleware, guard({ permission: '' })] as const,
  handler: async (c) => c.json(okBody(await listMenuTree()), 200),
});

const flatRoute = defineContractRoute(menuContract.flat, {
  middleware: [authMiddleware, guard({ permission: 'system:menu:list' })] as const,
  handler: async (c) => c.json(okBody(await listMenusFlat()), 200),
});
const createMenuRoute = defineContractRoute(menuContract.create, {
  middleware: [authMiddleware, platformOnly, guard({ permission: 'system:menu:create', audit: { description: '创建菜单', module: '菜单管理' } })] as const,
  handler: async (c) => c.json(okBody(await createMenu(c.req.valid('json')), '创建成功'), 200),
});

const updateMenuRoute = defineContractRoute(menuContract.update, {
  middleware: [authMiddleware, platformOnly, guard({ permission: 'system:menu:update', audit: { description: '更新菜单', module: '菜单管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getMenuBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateMenu(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteMenuRoute = defineContractRoute(menuContract.remove, {
  middleware: [authMiddleware, platformOnly, guard({ permission: 'system:menu:delete', audit: { description: '删除菜单', module: '菜单管理' } })] as const,
  responses: conflictResponse,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getMenuCascadeBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteMenu(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mountCrud(menusRouter, menuContract,
  { get: getMenu },
  { permission: 'system:menu', exclude: ['create', 'update', 'remove'] },
  [userMenuRoute, listRoute, flatRoute, createMenuRoute, updateMenuRoute, deleteMenuRoute],
);

export default menusRouter;
