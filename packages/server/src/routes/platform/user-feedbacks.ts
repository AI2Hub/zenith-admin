import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { idempotencyGuard } from '../../middleware/idempotency';
import {
  ErrorResponse, jsonContent,
  PaginationQuery, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, BatchIdsBody,
  okBody, errBody,
} from '../../lib/openapi-schemas';
import { UserFeedbackDTO } from '../../lib/openapi-dtos';
import { createUserFeedbackSchema, handleUserFeedbackSchema } from '@zenith/shared';
import {
  batchDeleteUserFeedbacks,
  createUserFeedback,
  deleteUserFeedback,
  ensureUserFeedbackExists,
  handleUserFeedback,
  listUserFeedbacks,
  mapUserFeedback,
} from '../../services/platform/user-feedbacks.service';

const userFeedbacksRouter = new OpenAPIHono({ defaultHook: validationHook });

// ─── POST / — 提交反馈（所有登录用户可用，无需权限码）─────────────────────────
const submitRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/',
    tags: ['意见反馈'], summary: '提交意见反馈',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 10, message: '反馈提交中，请勿重复提交' })] as const,
    request: { body: { content: jsonContent(createUserFeedbackSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(UserFeedbackDTO, '提交成功'),
    },
  }),
  handler: async (c) => {
    const data = c.req.valid('json');
    const row = await createUserFeedback(data);
    return c.json(okBody(row, '感谢您的反馈'), 200);
  },
});

// ─── GET / — 分页列表 ────────────────────────────────────────────────────────
const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/',
    tags: ['意见反馈'], summary: '反馈列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:feedback:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        category: z.enum(['suggestion', 'bug', 'ux', 'other']).optional(),
        status: z.enum(['pending', 'processing', 'resolved', 'ignored']).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }),
    },
    responses: {
      ...commonErrorResponses,
      ...okPaginated(UserFeedbackDTO, 'ok'),
    },
  }),
  handler: async (c) => c.json(okBody(await listUserFeedbacks(c.req.valid('query'))), 200),
});

// ─── PUT /{id}/handle — 处理反馈 ─────────────────────────────────────────────
const handleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}/handle',
    tags: ['意见反馈'], summary: '处理反馈',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:feedback:handle', audit: { description: '处理意见反馈', module: '意见反馈' } })] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(handleUserFeedbackSchema), required: true },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(UserFeedbackDTO, '处理成功'),
      404: { content: jsonContent(ErrorResponse), description: '不存在' },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const before = await ensureUserFeedbackExists(id);
    setAuditBeforeData(c, mapUserFeedback(before));
    const row = await handleUserFeedback(id, data);
    return c.json(okBody(row, '处理成功'), 200);
  },
});

// ─── DELETE /batch — 批量删除（必须注册在 /{id} 之前）───────────────────────
const batchDeleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/batch',
    tags: ['意见反馈'], summary: '批量删除反馈',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:feedback:delete', audit: { description: '批量删除意见反馈', module: '意见反馈' } })] as const,
    request: { body: { content: jsonContent(BatchIdsBody), required: true } },
    responses: {
      ...commonErrorResponses,
      ...okMsg('批量删除成功'),
      400: { content: jsonContent(ErrorResponse), description: '参数错误' },
    },
  }),
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    if (!ids || ids.length === 0) {
      return c.json(errBody('请选择要删除的记录'), 400);
    }
    const deleted = await batchDeleteUserFeedbacks(ids);
    return c.json(okBody(null, `已删除 ${deleted} 条记录`), 200);
  },
});

// ─── DELETE /{id} — 删除 ─────────────────────────────────────────────────────
const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}',
    tags: ['意见反馈'], summary: '删除反馈',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:feedback:delete', audit: { description: '删除意见反馈', module: '意见反馈' } })] as const,
    request: { params: IdParam },
    responses: {
      ...commonErrorResponses,
      ...okMsg('删除成功'),
      404: { content: jsonContent(ErrorResponse), description: '不存在' },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await ensureUserFeedbackExists(id);
    setAuditBeforeData(c, mapUserFeedback(before));
    await deleteUserFeedback(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

userFeedbacksRouter.openapiRoutes([submitRoute, listRoute, handleRoute, batchDeleteRoute, deleteRoute] as const);

export default userFeedbacksRouter;
