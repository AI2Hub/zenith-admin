import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { updatePaymentMethodConfigSchema } from '@zenith/shared';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import { jsonContent, validationHook, commonErrorResponses, ok, IdParam, okBody } from '../lib/openapi-schemas';
import { PaymentMethodConfigDTO } from '../lib/openapi-dtos';
import { listMethodConfigs, listEnabledMethodConfigs, getMethodConfig, updateMethodConfig } from '../services/payment-method.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['支付中心-支付方式'], summary: '支付方式配置列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:method:list' })] as const,
    responses: { ...ok(z.array(PaymentMethodConfigDTO), '支付方式配置列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listMethodConfigs()), 200),
});

const enabledRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/enabled', tags: ['支付中心-支付方式'], summary: '可用支付方式（供下单选择）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:order:create' })] as const,
    responses: { ...ok(z.array(PaymentMethodConfigDTO), '可用支付方式'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listEnabledMethodConfigs()), 200),
});

const detailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['支付中心-支付方式'], summary: '支付方式配置详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:method:list' })] as const,
    request: { params: IdParam },
    responses: { ...ok(PaymentMethodConfigDTO, '支付方式配置详情'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getMethodConfig(c.req.valid('param').id)), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['支付中心-支付方式'], summary: '编辑支付方式配置（启停/排序/名称/图标）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:method:update', audit: { description: '编辑支付方式配置', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updatePaymentMethodConfigSchema), required: true } },
    responses: { ...ok(PaymentMethodConfigDTO, '更新成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMethodConfig(id));
    return c.json(okBody(await updateMethodConfig(id, c.req.valid('json')), '更新成功'), 200);
  },
});

router.openapiRoutes([listRoute, enabledRoute, detailRoute, updateRoute] as const);

export default router;
