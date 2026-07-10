import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportQueryQuotaSchema,
  resetReportQueryQuotaSchema,
  updateReportQueryQuotaSchema,
} from '@zenith/shared';
import {
  ReportQueryCostLogDTO,
  ReportQueryCostStatsDTO,
  ReportQueryCostTrendPointDTO,
  ReportQueryQuotaDTO,
  ReportQueryQuotaUsageDTO,
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
import {
  createReportQueryQuota,
  deleteReportQueryQuota,
  getReportQueryCostStats,
  getReportQueryCostTrend,
  getReportQueryQuota,
  getReportQueryQuotaUsage,
  listReportQueryCostLogs,
  listReportQueryQuotas,
  resetReportQueryQuotaUsage,
  updateReportQueryQuota,
} from '../../services/report/report-query-capacity.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表查询容量'];
const rangeQuery = z.object({
  datasetId: z.coerce.number().int().positive().optional(),
  datasourceId: z.coerce.number().int().positive().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

const listQuotasRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/quotas', tags, summary: '查询配额列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:list' })] as const,
    request: { query: PaginationQuery },
    responses: { ...commonErrorResponses, ...okPaginated(ReportQueryQuotaDTO, 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listReportQueryQuotas(query.page, query.pageSize)), 200);
  },
});

const getQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/quotas/{id}', tags, summary: '查询配额详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportQueryQuotaDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportQueryQuota(c.req.valid('param').id)), 200),
});

const createQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/quotas', tags, summary: '创建查询配额',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:create', audit: { module: '报表查询容量', description: '创建查询配额' } })] as const,
    request: { body: { content: jsonContent(createReportQueryQuotaSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportQueryQuotaDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportQueryQuota(c.req.valid('json')), '创建成功'), 200),
});

const updateQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/quotas/{id}', tags, summary: '更新查询配额',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:update', audit: { module: '报表查询容量', description: '更新查询配额' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportQueryQuotaSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportQueryQuotaDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportQueryQuota(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const deleteQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/quotas/{id}', tags, summary: '删除查询配额',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:delete', audit: { module: '报表查询容量', description: '删除查询配额' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportQueryQuota(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const quotaUsageRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/quotas/{id}/usage', tags, summary: '查询配额用量',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:list' })] as const,
    request: { params: IdParam, query: z.object({ scopeDate: z.string().date().optional() }) },
    responses: { ...commonErrorResponses, ...ok(ReportQueryQuotaUsageDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportQueryQuotaUsage(
    c.req.valid('param').id,
    c.req.valid('query').scopeDate,
  )), 200),
});

const resetQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/quotas/{id}/reset', tags, summary: '重置查询配额用量',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-quota:update', audit: { module: '报表查询容量', description: '重置查询配额用量' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(resetReportQueryQuotaSchema), required: true } },
    responses: { ...commonErrorResponses, ...okMsg('重置成功') },
  }),
  handler: async (c) => {
    await resetReportQueryQuotaUsage(c.req.valid('param').id, c.req.valid('json').scopeDate);
    return c.json(okBody(null, '重置成功'), 200);
  },
});

const costLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/cost-logs', tags, summary: '查询成本日志',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-cost:list' })] as const,
    request: { query: PaginationQuery.extend({
      userId: z.coerce.number().int().positive().optional(),
      datasetId: z.coerce.number().int().positive().optional(),
      datasourceId: z.coerce.number().int().positive().optional(),
      scene: z.string().max(64).optional(),
      success: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportQueryCostLogDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportQueryCostLogs(c.req.valid('query'))), 200),
});

const costStatsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/cost-stats', tags, summary: '查询成本统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-cost:list' })] as const,
    request: { query: rangeQuery },
    responses: { ...commonErrorResponses, ...ok(ReportQueryCostStatsDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportQueryCostStats(c.req.valid('query'))), 200),
});

const costTrendRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/cost-trend', tags, summary: '查询成本趋势',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:query-cost:list' })] as const,
    request: { query: rangeQuery.extend({ bucket: z.enum(['hour', 'day']).default('day') }) },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportQueryCostTrendPointDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportQueryCostTrend(c.req.valid('query'))), 200),
});

router.openapiRoutes([
  listQuotasRoute, getQuotaRoute, createQuotaRoute, updateQuotaRoute, deleteQuotaRoute,
  quotaUsageRoute, resetQuotaRoute, costLogsRoute, costStatsRoute, costTrendRoute,
] as const);

export default router;
