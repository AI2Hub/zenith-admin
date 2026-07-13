/**
 * 支付链接公开端点（无需登录，供 C 端用户访问收款链接/收款码）。
 *
 * GET  /api/public/payment/link/{token}      展示链接信息
 * POST /api/public/payment/link/{token}/pay  按链接下单（复用 payment.service.createPayment）
 */
import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { jsonContent, validationHook, commonErrorResponses, ok, okBody } from '../../lib/openapi-schemas';
import { PaymentLinkPublicDTO, CreatePaymentResponseDTO } from '../../lib/openapi-dtos';
import { getPublicLink, getPublicLinkOrderStatus, payByLink } from '../../services/payment/payment-link.service';
import { getClientIp } from '../../lib/request-helpers';

const router = new OpenAPIHono({ defaultHook: validationHook });

const TokenParam = z.object({
  token: z.string().min(8).max(64).openapi({ param: { name: 'token', in: 'path' }, example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' }),
});
const payMethodEnum = z.enum(['wechat_native', 'wechat_h5', 'alipay_page', 'alipay_wap', 'unionpay_qr']);

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{token}', tags: ['支付链接（公开）'], summary: '获取支付链接信息（公开，无需登录）',
    security: [],
    request: { params: TokenParam },
    responses: { ...ok(PaymentLinkPublicDTO, '支付链接信息'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getPublicLink(c.req.valid('param').token)), 200),
});

const payRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{token}/pay', tags: ['支付链接（公开）'], summary: '通过支付链接下单（公开，无需登录）',
    security: [],
    request: {
      params: TokenParam,
      body: { content: jsonContent(z.object({ amount: z.number().int().positive().optional(), payMethod: payMethodEnum.optional(), openId: z.string().max(128).optional() })), required: true },
    },
    responses: { ...ok(CreatePaymentResponseDTO, '下单成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { token } = c.req.valid('param');
    const body = c.req.valid('json');
    return c.json(okBody(await payByLink(token, { ...body, clientIp: getClientIp(c) }), '下单成功'), 200);
  },
});

const statusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{token}/orders/{orderNo}/status', tags: ['支付链接（公开）'], summary: '查询收银台订单支付状态（公开，供轮询）',
    security: [],
    request: {
      params: TokenParam.extend({
        orderNo: z.string().min(8).max(64).openapi({ param: { name: 'orderNo', in: 'path' } }),
      }),
    },
    responses: { ...ok(z.object({ status: z.string(), paidAt: z.string().nullable() }), '订单状态'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { token, orderNo } = c.req.valid('param');
    return c.json(okBody(await getPublicLinkOrderStatus(token, orderNo)), 200);
  },
});

router.openapiRoutes([getRoute, payRoute, statusRoute] as const);

export default router;
