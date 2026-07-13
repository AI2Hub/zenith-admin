/**
 * 支付风控运营路由（/api/payment/risk）。
 * 拦截/命中留痕列表、人工审核队列（放行/拒绝）。规则 CRUD 见 /api/payment/risk-rules。
 */
import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { handlePaymentRiskReviewSchema } from '@zenith/shared';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, IdParam, okBody } from '../../lib/openapi-schemas';
import { PaymentRiskHitDTO, PaymentRiskReviewDTO } from '../../lib/openapi-dtos';
import {
  approveRiskReview,
  findRiskReviewById,
  listRiskHits,
  listRiskReviews,
  rejectRiskReview,
} from '../../services/payment/payment-risk.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const channelEnum = z.enum(['wechat', 'alipay', 'unionpay']);

const hitsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/hits', tags: ['支付中心-风控'], summary: '风控命中/拦截记录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        action: z.enum(['block', 'review']).optional(),
        dimension: z.enum(['blocklist', 'single_limit', 'daily_limit', 'daily_count']).optional(),
        channel: channelEnum.optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }),
    },
    responses: { ...okPaginated(PaymentRiskHitDTO, '命中记录列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listRiskHits(c.req.valid('query'))), 200),
});

const reviewsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/reviews', tags: ['支付中心-风控'], summary: '人工审核队列',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        channel: channelEnum.optional(),
      }),
    },
    responses: { ...okPaginated(PaymentRiskReviewDTO, '审核队列'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listRiskReviews(c.req.valid('query'))), 200),
});

async function reviewBefore(id: number) {
  return findRiskReviewById(id);
}

const approveRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/reviews/{id}/approve', tags: ['支付中心-风控'], summary: '审核放行（挂起订单可继续支付）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:review', audit: { description: '风控审核放行', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(handlePaymentRiskReviewSchema), required: false } },
    responses: { ...ok(PaymentRiskReviewDTO, '已放行'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await reviewBefore(id));
    const body = (c.req.valid('json') ?? {}) as { remark?: string };
    return c.json(okBody(await approveRiskReview(id, body.remark), '已放行'), 200);
  },
});

const rejectRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/reviews/{id}/reject', tags: ['支付中心-风控'], summary: '审核拒绝（关闭挂起订单）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:risk:review', audit: { description: '风控审核拒绝', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(handlePaymentRiskReviewSchema), required: false } },
    responses: { ...ok(PaymentRiskReviewDTO, '已拒绝'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await reviewBefore(id));
    const body = (c.req.valid('json') ?? {}) as { remark?: string };
    return c.json(okBody(await rejectRiskReview(id, body.remark), '已拒绝'), 200);
  },
});

router.openapiRoutes([hitsRoute, reviewsRoute, approveRoute, rejectRoute] as const);

export default router;
