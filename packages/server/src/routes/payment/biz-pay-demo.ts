import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { createBizPayDemoSchema, payBizPayDemoSchema } from '@zenith/shared';
import { authMiddleware } from '../../middleware/auth';
import { idempotencyGuard } from '../../middleware/idempotency';
import {
  jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, okBody, IdParam, PaginationQuery,
} from '../../lib/openapi-schemas';
import { BizPayDemoDTO, BizPayDemoPayResultDTO } from '../../lib/openapi-dtos';
import { getClientIp } from '../../lib/request-helpers';
import {
  listBizPayDemos, getBizPayDemo, createBizPayDemo, deleteBizPayDemo, payBizPayDemo, simulateBizPayDemoPaid,
} from '../../services/payment/biz-pay-demo.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['BizPayDemo'], summary: '我的支付示例单列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional(), status: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(BizPayDemoDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listBizPayDemos(c.req.valid('query'))), 200),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['BizPayDemo'], summary: '支付示例单详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(BizPayDemoDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getBizPayDemo(c.req.valid('param').id)), 200),
});

const createRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['BizPayDemo'], summary: '新建支付示例单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { body: { content: jsonContent(createBizPayDemoSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(BizPayDemoDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createBizPayDemo(c.req.valid('json')), '创建成功'), 200),
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['BizPayDemo'], summary: '删除支付示例单',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('已删除') },
  }),
  handler: async (c) => {
    await deleteBizPayDemo(c.req.valid('param').id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

const payRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/pay', tags: ['BizPayDemo'], summary: '发起支付（调用统一支付门面下单）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 10, message: '下单处理中，请勿重复提交' })] as const,
    request: { params: IdParam, body: { content: jsonContent(payBizPayDemoSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(BizPayDemoPayResultDTO, '下单成功') },
  }),
  handler: async (c) => c.json(okBody(await payBizPayDemo(c.req.valid('param').id, c.req.valid('json'), getClientIp(c)), '下单成功'), 200),
});

const simulateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/simulate-paid', tags: ['BizPayDemo'], summary: '模拟支付成功（演示专用，驱动真实履约订阅器）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(BizPayDemoDTO, '已模拟支付成功') },
  }),
  handler: async (c) => c.json(okBody(await simulateBizPayDemoPaid(c.req.valid('param').id), '已模拟支付成功'), 200),
});

router.openapiRoutes([listRoute, getRoute, createRoute_, deleteRoute, payRoute, simulateRoute] as const);

export default router;
