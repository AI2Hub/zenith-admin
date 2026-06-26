import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { createPaymentRiskRuleSchema, updatePaymentRiskRuleSchema } from '@zenith/shared';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import { PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody } from '../lib/openapi-schemas';
import { PaymentRiskRuleDTO } from '../lib/openapi-dtos';
import { listRiskRules, getRiskRule, createRiskRule, updateRiskRule, deleteRiskRule } from '../services/payment-risk.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const scopeEnum = z.enum(['global', 'channel', 'bizType']);

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['支付中心-风控'], summary: '风控规则列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:list' })] as const,
    request: { query: PaginationQuery.extend({ scope: scopeEnum.optional(), status: z.enum(['enabled', 'disabled']).optional() }) },
    responses: { ...okPaginated(PaymentRiskRuleDTO, '风控规则列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listRiskRules(c.req.valid('query'))), 200),
});

const detailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['支付中心-风控'], summary: '风控规则详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:list' })] as const,
    request: { params: IdParam },
    responses: { ...ok(PaymentRiskRuleDTO, '风控规则详情'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getRiskRule(c.req.valid('param').id)), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['支付中心-风控'], summary: '新增风控规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:create', audit: { description: '新增支付风控规则', module: '支付中心' } })] as const,
    request: { body: { content: jsonContent(createPaymentRiskRuleSchema), required: true } },
    responses: { ...ok(PaymentRiskRuleDTO, '创建成功'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await createRiskRule(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['支付中心-风控'], summary: '编辑风控规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:update', audit: { description: '编辑支付风控规则', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updatePaymentRiskRuleSchema), required: true } },
    responses: { ...ok(PaymentRiskRuleDTO, '更新成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getRiskRule(id));
    return c.json(okBody(await updateRiskRule(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['支付中心-风控'], summary: '删除风控规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:delete', audit: { description: '删除支付风控规则', module: '支付中心' } })] as const,
    request: { params: IdParam },
    responses: { ...okMsg('删除成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getRiskRule(id));
    await deleteRiskRule(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([listRoute, detailRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default router;
