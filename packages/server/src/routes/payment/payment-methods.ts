import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentMethodContract } from '@zenith/shared/payment';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { listMethodConfigs, listEnabledMethodConfigs, getMethodConfig, updateMethodConfig } from '../../services/payment/payment-method.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineContractRoute(paymentMethodContract.list, {
  middleware: [authMiddleware, guard({ permission: 'payment:method:list' })],
  handler: async (c) => c.json(okBody(await listMethodConfigs()), 200),
});

const enabledRoute = defineContractRoute(paymentMethodContract.enabled, {
  middleware: [authMiddleware, guard({ permission: 'payment:order:create' })],
  handler: async (c) => c.json(okBody(await listEnabledMethodConfigs()), 200),
});

mountCrud(router, paymentMethodContract,
  { get: getMethodConfig, update: updateMethodConfig },
  {
    permission: 'payment:method',
    label: '支付方式配置',
    module: '支付中心',
    audit: { update: '编辑支付方式配置' },
    exclude: ['list'],
  },
  [listRoute, enabledRoute],
);

export default router;
