/**
 * 商户资金账户路由（/api/payment/accounts）。
 * 账户总览、余额核对（快照 vs 流水聚合）、快照重建、人工调账。
 */
import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { adjustPaymentAccountSchema } from '@zenith/shared';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { idempotencyGuard } from '../../middleware/idempotency';
import { jsonContent, validationHook, commonErrorResponses, ok, okBody } from '../../lib/openapi-schemas';
import { PaymentAccountDTO, PaymentAccountCheckDTO } from '../../lib/openapi-dtos';
import {
  adjustAccount,
  checkAccounts,
  listAccounts,
  rebuildAccountsFromLedger,
} from '../../services/payment/payment-account.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['支付中心-资金账户'], summary: '资金账户总览（各渠道待结算/可用/冻结）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:ledger:list' })] as const,
    responses: { ...ok(z.array(PaymentAccountDTO), '账户总览'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listAccounts()), 200),
});

const checkRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/check', tags: ['支付中心-资金账户'], summary: '余额核对（快照 vs 流水聚合）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:ledger:list' })] as const,
    responses: { ...ok(z.array(PaymentAccountCheckDTO), '核对结果'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await checkAccounts()), 200),
});

const rebuildRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rebuild', tags: ['支付中心-资金账户'], summary: '从流水重建账户快照（存量初始化/差错修复）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:account:adjust', audit: { description: '重建资金账户快照', module: '支付中心' } })] as const,
    responses: { ...ok(z.object({ accounts: z.number().int() }), '重建完成'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody({ accounts: await rebuildAccountsFromLedger() }, '重建完成'), 200),
});

const adjustRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/adjust', tags: ['支付中心-资金账户'], summary: '人工调账（记 adjust 流水并联动可用余额）',
    description: '资金操作接口，挂幂等防重复提交。',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'payment:account:adjust', audit: { description: '资金账户调账', module: '支付中心' } }),
      idempotencyGuard({ ttlSeconds: 10 }),
    ] as const,
    request: { body: { content: jsonContent(adjustPaymentAccountSchema), required: true } },
    responses: { ...ok(PaymentAccountDTO, '调账成功'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await adjustAccount(c.req.valid('json')), '调账成功'), 200),
});

router.openapiRoutes([listRoute, checkRoute, rebuildRoute, adjustRoute] as const);

export default router;
