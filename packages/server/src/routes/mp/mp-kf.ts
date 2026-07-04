import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../../lib/openapi-schemas';
import { createMpKfAccountSchema, updateMpKfAccountSchema } from '@zenith/shared';
import { MpKfAccountDTO, MpTagSyncResultDTO } from '../../lib/openapi-dtos';
import {
  listMpKfAccounts, createMpKfAccount, updateMpKfAccount, deleteMpKfAccount, getMpKfAccountBeforeAudit, syncMpKfAccounts,
} from '../../services/mp/mp-kf.service';

const mpKfRouter = new OpenAPIHono({ defaultHook: validationHook });

const syncBody = z.object({ accountId: z.number().int().positive() });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号多客服'], summary: '客服账号列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:kf:list' })] as const,
    request: { query: PaginationQuery.extend({ accountId: z.coerce.number().int().positive(), keyword: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(MpKfAccountDTO, '客服账号列表') },
  }),
  handler: async (c) => c.json(okBody(await listMpKfAccounts(c.req.valid('query'))), 200),
});

const syncRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sync', tags: ['公众号多客服'], summary: '从微信同步客服账号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:kf:sync', audit: { description: '同步客服账号', module: '公众号多客服' } })] as const,
    request: { body: { content: jsonContent(syncBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTagSyncResultDTO, '同步完成') },
  }),
  handler: async (c) => c.json(okBody(await syncMpKfAccounts(c.req.valid('json').accountId), '同步完成'), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['公众号多客服'], summary: '添加客服账号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:kf:create', audit: { description: '添加客服账号', module: '公众号多客服' } })] as const,
    request: { body: { content: jsonContent(createMpKfAccountSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpKfAccountDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createMpKfAccount(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['公众号多客服'], summary: '修改客服昵称',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:kf:update', audit: { description: '修改客服账号', module: '公众号多客服' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateMpKfAccountSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpKfAccountDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpKfAccountBeforeAudit(id));
    return c.json(okBody(await updateMpKfAccount(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['公众号多客服'], summary: '删除客服账号',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:kf:delete', audit: { description: '删除客服账号', module: '公众号多客服' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpKfAccountBeforeAudit(id));
    await deleteMpKfAccount(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mpKfRouter.openapiRoutes([listRoute, syncRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default mpKfRouter;
