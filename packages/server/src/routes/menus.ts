import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db';
import { menus } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { isSuperAdmin, getUserMenuIds } from '../lib/permissions';
import type { Menu } from '@zenith/shared';
import { ErrorResponse, jsonContent, validationHook, commonErrorResponses, ok, okMsg, IdParam, okBody, errBody } from '../lib/openapi-schemas';
import { MenuDTO } from '../lib/openapi-dtos';
import { mapMenu, buildMenuTree } from '../services/menus.service';

const menusRouter = new OpenAPIHono({ defaultHook: validationHook });

// ─── Schemas ───────────────────────────────────────────────────────────────

const createMenuSchema = z.object({
  parentId: z.coerce.number().int().default(0),
  title: z.string().min(1).max(64),
  name: z.string().max(64).optional(),
  path: z.string().max(256).optional(),
  component: z.string().max(256).optional(),
  icon: z.string().max(64).optional(),
  type: z.enum(['directory', 'menu', 'button']).default('menu'),
  permission: z.string().max(128).optional(),
  sort: z.coerce.number().int().default(0),
  status: z.enum(['active', 'disabled']).default('active'),
  visible: z.boolean().default(true),
});
const updateMenuSchema = createMenuSchema.partial();

// ─── Routes ────────────────────────────────────────────────────────────────
const userMenuRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/user',
    tags: ['Menus'],
    summary: '当前用户可见菜单�?,
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(MenuDTO), '菜单�?),
    },
  }),
  handler: async (c) => {
    const user = c.get('user');
    const allMenus = await db.select().from(menus).orderBy(asc(menus.sort), asc(menus.id));

    if (isSuperAdmin(user.roles)) {
      return c.json(okBody(buildMenuTree(allMenus.map(mapMenu))), 200);
    }

    const allowedMenuIds = new Set(await getUserMenuIds(user.userId));
    const idToMenu = new Map(allMenus.map((m) => [m.id, m]));
    for (const id of new Set(allowedMenuIds)) {
      let current = idToMenu.get(id);
      while (current && current.parentId !== 0) {
        if (allowedMenuIds.has(current.parentId)) break;
        allowedMenuIds.add(current.parentId);
        current = idToMenu.get(current.parentId);
      }
    }

    const filtered = allMenus.filter((m) => allowedMenuIds.has(m.id) || !m.visible);
    return c.json(okBody(buildMenuTree(filtered.map(mapMenu))), 200);
  },
});

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['Menus'],
    summary: '菜单树（管理用）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:menu:list' })] as const,
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(MenuDTO), '全量菜单�?),
    },
  }),
  handler: async (c) => {
    const list = await db.select().from(menus).orderBy(asc(menus.sort), asc(menus.id));
    return c.json(okBody(buildMenuTree(list.map(mapMenu))), 200);
  },
});

const flatRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/flat',
    tags: ['Menus'],
    summary: '平铺菜单列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:menu:list' })] as const,
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(MenuDTO), '平铺菜单'),
    },
  }),
  handler: async (c) => {
    const list = await db.select().from(menus).orderBy(asc(menus.sort), asc(menus.id));
    return c.json(okBody(list.map(mapMenu)), 200);
  },
});

const createMenuRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['Menus'],
    summary: '新增菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:menu:create', audit: { description: '创建菜单', module: '菜单管理' } })] as const,
    request: { body: { content: jsonContent(createMenuSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(MenuDTO, '创建成功'),
    },
  }),
  handler: async (c) => {
    const data = c.req.valid('json');
    const [menu] = await db.insert(menus).values(data).returning();
    return c.json(okBody(mapMenu(menu), '创建成功'), 200);
  },
});

const updateMenuRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Menus'],
    summary: '更新菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:menu:update', audit: { description: '更新菜单', module: '菜单管理' } })] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(updateMenuSchema), required: true },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(MenuDTO, '更新成功'),
      404: { content: jsonContent(ErrorResponse), description: '菜单不存�? },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const [menu] = await db
      .update(menus)
      .set({ ...data })
      .where(eq(menus.id, id))
      .returning();
    if (!menu) return c.json(errBody('菜单不存�?, 404), 404);
    return c.json(okBody(mapMenu(menu), '更新成功'), 200);
  },
});

const deleteMenuRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Menus'],
    summary: '删除菜单及子菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:menu:delete', audit: { description: '删除菜单', module: '菜单管理' } })] as const,
    request: { params: IdParam },
    responses: {
      ...commonErrorResponses,
      ...okMsg('删除成功'),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const all = await db.select({ id: menus.id, parentId: menus.parentId }).from(menus);
    const toDelete = new Set<number>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      toDelete.add(cur);
      all.filter((m) => m.parentId === cur).forEach((m) => queue.push(m.id));
    }
    for (const mid of toDelete) {
      await db.delete(menus).where(and(eq(menus.id, mid)));
    }
    return c.json(okBody(null, '删除成功'), 200);
  },
});

menusRouter.openapiRoutes([userMenuRoute, listRoute, flatRoute, createMenuRoute, updateMenuRoute, deleteMenuRoute] as const);

export default menusRouter;
