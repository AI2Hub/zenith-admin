import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { createPaymentLinkSchema, updatePaymentLinkSchema } from '@zenith/shared';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import { PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody } from '../lib/openapi-schemas';
import { PaymentLinkDTO } from '../lib/openapi-dtos';
import { listLinks, getLink, createLink, updateLink, deleteLink } from '../services/payment-link.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['支付中心-支付链接'], summary: '支付链接列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:link:list' })] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional(), status: z.enum(['active', 'disabled']).optional() }) },
    responses: { ...okPaginated(PaymentLinkDTO, '支付链接列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listLinks(c.req.valid('query'))), 200),
});

const detailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['支付中心-支付链接'], summary: '支付链接详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:link:list' })] as const,
    request: { params: IdParam },
    responses: { ...ok(PaymentLinkDTO, '支付链接详情'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getLink(c.req.valid('param').id)), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['支付中心-支付链接'], summary: '新增支付链接',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:link:create', audit: { description: '新增支付链接', module: '支付中心' } })] as const,
    request: { body: { content: jsonContent(createPaymentLinkSchema), required: true } },
    responses: { ...ok(PaymentLinkDTO, '创建成功'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await createLink(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['支付中心-支付链接'], summary: '编辑支付链接',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:link:update', audit: { description: '编辑支付链接', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updatePaymentLinkSchema), required: true } },
    responses: { ...ok(PaymentLinkDTO, '更新成功'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await updateLink(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['支付中心-支付链接'], summary: '删除支付链接',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:link:delete', audit: { description: '删除支付链接', module: '支付中心' } })] as const,
    request: { params: IdParam },
    responses: { ...okMsg('删除成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getLink(id));
    await deleteLink(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([listRoute, detailRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default router;
