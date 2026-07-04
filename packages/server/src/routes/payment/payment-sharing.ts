import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { createPaymentSharingReceiverSchema, updatePaymentSharingReceiverSchema } from '@zenith/shared';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody } from '../../lib/openapi-schemas';
import { PaymentSharingReceiverDTO, PaymentSharingOrderDTO } from '../../lib/openapi-dtos';
import {
  listReceivers,
  getReceiver,
  createReceiver,
  updateReceiver,
  deleteReceiver,
  listSharingOrders,
  dispatchSharing,
} from '../../services/payment/payment-sharing.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const statusEnum = z.enum(['enabled', 'disabled']);
const sharingOrderStatusEnum = z.enum(['pending', 'processing', 'success', 'failed']);

// ─── 接收方 CRUD ──────────────────────────────────────────────────────────────
const listReceiversRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/receivers', tags: ['支付中心-分账'], summary: '分账接收方列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:list' })] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional(), status: statusEnum.optional() }) },
    responses: { ...okPaginated(PaymentSharingReceiverDTO, '分账接收方列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listReceivers(c.req.valid('query'))), 200),
});

const receiverDetailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/receivers/{id}', tags: ['支付中心-分账'], summary: '分账接收方详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:list' })] as const,
    request: { params: IdParam },
    responses: { ...ok(PaymentSharingReceiverDTO, '分账接收方详情'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getReceiver(c.req.valid('param').id)), 200),
});

const createReceiverRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/receivers', tags: ['支付中心-分账'], summary: '新增分账接收方',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:manage', audit: { description: '新增分账接收方', module: '支付中心' } })] as const,
    request: { body: { content: jsonContent(createPaymentSharingReceiverSchema), required: true } },
    responses: { ...ok(PaymentSharingReceiverDTO, '创建成功'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await createReceiver(c.req.valid('json')), '创建成功'), 200),
});

const updateReceiverRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/receivers/{id}', tags: ['支付中心-分账'], summary: '编辑分账接收方',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:manage', audit: { description: '编辑分账接收方', module: '支付中心' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updatePaymentSharingReceiverSchema), required: true } },
    responses: { ...ok(PaymentSharingReceiverDTO, '更新成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getReceiver(id));
    return c.json(okBody(await updateReceiver(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteReceiverRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/receivers/{id}', tags: ['支付中心-分账'], summary: '删除分账接收方',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:manage', audit: { description: '删除分账接收方', module: '支付中心' } })] as const,
    request: { params: IdParam },
    responses: { ...okMsg('删除成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getReceiver(id));
    await deleteReceiver(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

// ─── 分账单 ───────────────────────────────────────────────────────────────────
const listOrdersRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/orders', tags: ['支付中心-分账'], summary: '分账单列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:list' })] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional(), status: sharingOrderStatusEnum.optional(), receiverId: z.coerce.number().int().optional() }) },
    responses: { ...okPaginated(PaymentSharingOrderDTO, '分账单列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listSharingOrders(c.req.valid('query'))), 200),
});

const dispatchRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/orders', tags: ['支付中心-分账'], summary: '发起分账',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'payment:sharing:dispatch', audit: { description: '发起支付分账', module: '支付中心' } })] as const,
    request: {
      body: { content: jsonContent(z.object({ orderNo: z.string().min(1).max(64), receiverId: z.number().int().positive(), amount: z.number().int().positive().optional(), remark: z.string().max(256).optional() })), required: true },
    },
    responses: { ...ok(PaymentSharingOrderDTO, '分账已发起'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await dispatchSharing(c.req.valid('json')), '分账已发起'), 200),
});

router.openapiRoutes([listReceiversRoute, receiverDetailRoute, createReceiverRoute, updateReceiverRoute, deleteReceiverRoute, listOrdersRoute, dispatchRoute] as const);

export default router;
