import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  jsonContent, validationHook, commonErrorResponses, ok, okMsg, IdParam, okBody,
} from '../../lib/openapi-schemas';
import { createMpConditionalMenuSchema, updateMpConditionalMenuSchema, tryMatchMpMenuSchema } from '@zenith/shared';
import { MpConditionalMenuDTO, MpMenuTryMatchDTO } from '../../lib/openapi-dtos';
import {
  listMpConditionalMenus, createMpConditionalMenu, updateMpConditionalMenu,
  deleteMpConditionalMenu, publishMpConditionalMenu, tryMatchMpMenu, getMpConditionalMenuBeforeAudit,
} from '../../services/mp/mp-conditional-menu.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号个性化菜单'], summary: '个性化菜单列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:list' })] as const,
    request: { query: z.object({ accountId: z.coerce.number().int().positive() }) },
    responses: { ...commonErrorResponses, ...ok(z.array(MpConditionalMenuDTO), '个性化菜单列表') },
  }),
  handler: async (c) => c.json(okBody(await listMpConditionalMenus(c.req.valid('query').accountId)), 200),
});

const tryMatchRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/trymatch', tags: ['公众号个性化菜单'], summary: '菜单匹配测试',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:list' })] as const,
    request: { body: { content: jsonContent(tryMatchMpMenuSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpMenuTryMatchDTO, '命中的菜单') },
  }),
  handler: async (c) => { const b = c.req.valid('json'); return c.json(okBody(await tryMatchMpMenu(b.accountId, b.userId)), 200); },
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['公众号个性化菜单'], summary: '新增个性化菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:create', audit: { description: '新增个性化菜单', module: '公众号个性化菜单' } })] as const,
    request: { body: { content: jsonContent(createMpConditionalMenuSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpConditionalMenuDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createMpConditionalMenu(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['公众号个性化菜单'], summary: '编辑个性化菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:update', audit: { description: '编辑个性化菜单', module: '公众号个性化菜单' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateMpConditionalMenuSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpConditionalMenuDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpConditionalMenuBeforeAudit(id));
    return c.json(okBody(await updateMpConditionalMenu(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const publishRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/publish', tags: ['公众号个性化菜单'], summary: '发布个性化菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:publish', audit: { description: '发布个性化菜单', module: '公众号个性化菜单' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(MpConditionalMenuDTO, '发布成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpConditionalMenuBeforeAudit(id));
    return c.json(okBody(await publishMpConditionalMenu(id), '发布成功'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['公众号个性化菜单'], summary: '删除个性化菜单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:condmenu:delete', audit: { description: '删除个性化菜单', module: '公众号个性化菜单' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpConditionalMenuBeforeAudit(id));
    await deleteMpConditionalMenu(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([listRoute, tryMatchRoute, createRouteDef, updateRoute, publishRoute, deleteRoute] as const);

export default router;
