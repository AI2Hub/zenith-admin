import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportMetricSchema,
  reportMetricEvaluateSchema,
  reportMetricLifecycleStatusSchema,
  reportMetricLifecycleActionSchema,
  reportMetricTypeSchema,
  updateReportMetricSchema,
} from '@zenith/shared';
import {
  ReportMetricDTO,
  ReportMetricEvaluationDTO,
  ReportMetricLookupDTO,
  ReportMetricRefsDTO,
} from '../../lib/openapi-dtos';
import {
  commonErrorResponses,
  ErrorResponse,
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
  collectReportMetricRefs,
  createReportMetric,
  deleteReportMetric,
  deprecateReportMetric,
  evaluateReportMetric,
  getReportMetric,
  listReportMetricLookup,
  listReportMetrics,
  publishReportMetric,
  updateReportMetric,
} from '../../services/report/report-metric.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const conflict = { 409: { content: jsonContent(ErrorResponse), description: '版本冲突' } } as const;

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['报表指标'], summary: '指标列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        datasetId: z.coerce.number().int().positive().optional(),
        folderId: z.coerce.number().int().positive().optional(),
        ownerId: z.coerce.number().int().positive().optional(),
        type: reportMetricTypeSchema.optional(),
        status: z.enum(['draft', 'published', 'deprecated']).optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...okPaginated(ReportMetricDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportMetrics(c.req.valid('query'))), 200),
});

const lookupRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/lookup', tags: ['报表指标'], summary: '指标下拉',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:list' })] as const,
    request: {
      query: z.object({
        keyword: z.string().optional(),
        status: reportMetricLifecycleStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(20),
      }),
    },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportMetricLookupDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportMetricLookup(c.req.valid('query'))), 200),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['报表指标'], summary: '指标详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportMetricDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportMetric(c.req.valid('param').id)), 200),
});

const createRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['报表指标'], summary: '创建指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:create', audit: { module: '报表指标', description: '创建指标' } })] as const,
    request: { body: { content: jsonContent(createReportMetricSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportMetricDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportMetric(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['报表指标'], summary: '更新指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:update', audit: { module: '报表指标', description: '更新指标' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportMetricSchema), required: true } },
    responses: { ...commonErrorResponses, ...conflict, ...ok(ReportMetricDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportMetric(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const evaluateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/evaluate', tags: ['报表指标'], summary: '计算指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:evaluate' })] as const,
    request: { params: IdParam, body: { content: jsonContent(reportMetricEvaluateSchema), required: false } },
    responses: { ...commonErrorResponses, ...ok(ReportMetricEvaluationDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await evaluateReportMetric(c.req.valid('param').id, c.req.valid('json')?.params)), 200),
});

const publishRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/publish', tags: ['报表指标'], summary: '直接发布指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:publish', audit: { module: '报表指标', description: '发布指标' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(reportMetricLifecycleActionSchema), required: true } },
    responses: { ...commonErrorResponses, ...conflict, ...ok(ReportMetricDTO, '发布成功') },
  }),
  handler: async (c) => c.json(okBody(await publishReportMetric(c.req.valid('param').id, c.req.valid('json')), '发布成功'), 200),
});

const deprecateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/deprecate', tags: ['报表指标'], summary: '废弃指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:publish', audit: { module: '报表指标', description: '废弃指标' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(reportMetricLifecycleActionSchema), required: true } },
    responses: { ...commonErrorResponses, ...conflict, ...ok(ReportMetricDTO, '废弃成功') },
  }),
  handler: async (c) => c.json(okBody(await deprecateReportMetric(c.req.valid('param').id, c.req.valid('json')), '废弃成功'), 200),
});

const refsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}/refs', tags: ['报表指标'], summary: '指标引用',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportMetricRefsDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await collectReportMetricRefs(c.req.valid('param').id)), 200),
});

const deleteRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['报表指标'], summary: '删除指标',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:metric:delete', audit: { module: '报表指标', description: '删除指标' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportMetric(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([
  listRoute, lookupRoute, getRoute, createRoute_, updateRoute_, evaluateRoute,
  publishRoute, deprecateRoute, refsRoute, deleteRoute_,
] as const);

export default router;
