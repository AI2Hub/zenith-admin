import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportChatbiMessageSchema,
  createReportChatbiSessionSchema,
  reportChatbiSessionStatusSchema,
  saveReportChatbiMessageAssetSchema,
  updateReportChatbiSessionSchema,
} from '@zenith/shared';
import {
  ReportChatbiMessageDTO,
  ReportChatbiQuotaDTO,
  ReportChatbiSavedResourceDTO,
  ReportChatbiSessionDTO,
  ReportChatbiSessionDetailDTO,
} from '../../lib/openapi-dtos';
import {
  commonErrorResponses,
  IdParam,
  jsonContent,
  ok,
  okBody,
  okMsg,
  okPaginated,
  PaginationQuery,
  validationHook,
} from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { namedRateLimit } from '../../middleware/rate-limit';
import {
  archiveChatbiSession,
  askChatbi,
  createChatbiSession,
  deleteChatbiSession,
  getChatbiQuotaStats,
  getChatbiSession,
  listChatbiAudit,
  listChatbiSessions,
  saveChatbiMessageAsset,
  updateChatbiSession,
} from '../../services/report/report-chatbi.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表 ChatBI'];

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/sessions', tags, summary: 'ChatBI 会话列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:chatbi:list' })] as const,
    request: { query: PaginationQuery.extend({
      keyword: z.string().max(128).optional(),
      status: reportChatbiSessionStatusSchema.optional(),
      userId: z.coerce.number().int().positive().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportChatbiSessionDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listChatbiSessions(c.req.valid('query'))), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sessions', tags, summary: '创建 ChatBI 会话',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('report_chatbi_write'),
      guard({ permission: 'report:chatbi:create', audit: { module: '报表 ChatBI', description: '创建 ChatBI 会话' } }),
    ] as const,
    request: { body: { content: jsonContent(createReportChatbiSessionSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiSessionDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createChatbiSession(c.req.valid('json')), '创建成功'), 200),
});

const detailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/sessions/{id}', tags, summary: 'ChatBI 会话详情与消息历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:chatbi:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiSessionDetailDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getChatbiSession(c.req.valid('param').id)), 200),
});

const updateRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/sessions/{id}', tags, summary: '更新 ChatBI 会话',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('report_chatbi_write'),
      guard({ permission: 'report:chatbi:update', audit: { module: '报表 ChatBI', description: '更新 ChatBI 会话' } }),
    ] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(updateReportChatbiSessionSchema), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiSessionDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(
    await updateChatbiSession(c.req.valid('param').id, c.req.valid('json')),
    '更新成功',
  ), 200),
});

const archiveRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sessions/{id}/archive', tags, summary: '归档 ChatBI 会话',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('report_chatbi_write'),
      guard({ permission: 'report:chatbi:update', audit: { module: '报表 ChatBI', description: '归档 ChatBI 会话' } }),
    ] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiSessionDTO, '归档成功') },
  }),
  handler: async (c) => c.json(okBody(await archiveChatbiSession(c.req.valid('param').id), '归档成功'), 200),
});

const deleteRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/sessions/{id}', tags, summary: '删除 ChatBI 会话',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('report_chatbi_write'),
      guard({ permission: 'report:chatbi:delete', audit: { module: '报表 ChatBI', description: '删除 ChatBI 会话' } }),
    ] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteChatbiSession(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const askRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sessions/{id}/ask', tags, summary: 'ChatBI 多轮提问',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('chatbi_ask'),
      guard({
        permission: 'report:chatbi:ask',
        audit: { module: '报表 ChatBI', description: '执行 ChatBI 提问', recordResponseBody: false },
      }),
    ] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(createReportChatbiMessageSchema), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiMessageDTO, '执行成功') },
  }),
  handler: async (c) => c.json(okBody(await askChatbi(
    c.req.valid('param').id,
    c.req.valid('json'),
    c.req.raw.signal,
  )), 200),
});

const saveRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/messages/{id}/save', tags, summary: '保存 ChatBI 回答为数据集或仪表盘',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      namedRateLimit('report_chatbi_write'),
      guard({ permission: 'report:chatbi:save', audit: { module: '报表 ChatBI', description: '保存 ChatBI 资源' } }),
    ] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(saveReportChatbiMessageAssetSchema), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(ReportChatbiSavedResourceDTO, '保存成功') },
  }),
  handler: async (c) => c.json(okBody(
    await saveChatbiMessageAsset(c.req.valid('param').id, c.req.valid('json')),
    '保存成功',
  ), 200),
});

const quotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/quotas/me', tags, summary: '我的 ChatBI 当日用量',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:chatbi:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(ReportChatbiQuotaDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getChatbiQuotaStats()), 200),
});

const auditRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/audit', tags, summary: 'ChatBI 审计与成本明细',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:chatbi:audit' })] as const,
    request: { query: PaginationQuery.extend({
      userId: z.coerce.number().int().positive().optional(),
      failedOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportChatbiMessageDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listChatbiAudit(c.req.valid('query'))), 200),
});

router.openapiRoutes([
  listRoute,
  createRouteDef,
  detailRoute,
  updateRouteDef,
  archiveRoute,
  deleteRouteDef,
  askRoute,
  saveRoute,
  quotaRoute,
  auditRoute,
] as const);

export default router;
