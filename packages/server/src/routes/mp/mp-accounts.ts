import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../../lib/openapi-schemas';
import { createMpAccountSchema, updateMpAccountSchema, MP_ACCOUNT_TYPES } from '@zenith/shared';
import { MpAccountDTO, MpConnectionTestDTO } from '../../lib/openapi-dtos';
import {
  listMpAccounts, getMpAccount, createMpAccount, updateMpAccount,
  deleteMpAccount, getMpAccountBeforeAudit, setMpAccountDefault, testMpAccountConnection, getMpAccountDefaultAudit,
} from '../../services/mp/mp-account.service';

const mpAccountsRouter = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号管理'], summary: '公众号列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        type: z.enum(MP_ACCOUNT_TYPES).optional(),
        status: z.enum(['enabled', 'disabled']).optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...okPaginated(MpAccountDTO, '公众号列表') },
  }),
  handler: async (c) => c.json(okBody(await listMpAccounts(c.req.valid('query'))), 200),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['公众号管理'], summary: '获取公众号详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(MpAccountDTO, '公众号详情') },
  }),
  handler: async (c) => c.json(okBody(await getMpAccount(c.req.valid('param').id)), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['公众号管理'], summary: '创建公众号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:create', audit: { description: '创建公众号', module: '公众号管理' } })] as const,
    request: { body: { content: jsonContent(createMpAccountSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpAccountDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createMpAccount(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['公众号管理'], summary: '更新公众号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:update', audit: { description: '更新公众号', module: '公众号管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateMpAccountSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpAccountDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpAccountBeforeAudit(id));
    return c.json(okBody(await updateMpAccount(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const setDefaultRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/default', tags: ['公众号管理'], summary: '设为默认公众号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:default', audit: { description: '设为默认公众号', module: '公众号管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(MpAccountDTO, '操作成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpAccountDefaultAudit(id));
    const updated = await setMpAccountDefault(id);
    setAuditAfterData(c, await getMpAccountDefaultAudit(id));
    return c.json(okBody(updated, '操作成功'), 200);
  },
});

const testConnectionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/test', tags: ['公众号管理'], summary: '测试公众号连接',
    description: '使用账号 AppID/AppSecret 向微信换取 access_token，验证配置有效性并缓存 token。',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:token', audit: { description: '测试公众号连接', module: '公众号管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(MpConnectionTestDTO, '连接成功') },
  }),
  handler: async (c) => c.json(okBody(await testMpAccountConnection(c.req.valid('param').id), '连接成功'), 200),
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['公众号管理'], summary: '删除公众号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:account:delete', audit: { description: '删除公众号', module: '公众号管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpAccountBeforeAudit(id));
    await deleteMpAccount(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mpAccountsRouter.openapiRoutes([
  listRoute, getRoute, createRouteDef, updateRoute, setDefaultRoute, testConnectionRoute, deleteRoute,
] as const);

export default mpAccountsRouter;
