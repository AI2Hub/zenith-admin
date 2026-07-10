import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportDqRuleSchema,
  reportDqRuleTypeSchema,
  runReportDqRuleSchema,
  updateReportDqAnomalyStatusSchema,
  updateReportDqRuleSchema,
} from '@zenith/shared';
import {
  AsyncTaskDTO,
  ReportDqAnomalyDTO,
  ReportDqRuleDTO,
  ReportDqRunDTO,
  ReportDqScoreDTO,
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
  createReportDqRule,
  deleteReportDqRule,
  getCurrentReportDqScore,
  getReportDqRule,
  listReportDqAnomalies,
  listReportDqRules,
  listReportDqRuns,
  listReportDqScores,
  submitReportDqRuleRun,
  toggleReportDqRule,
  updateReportDqAnomalyStatus,
  updateReportDqRule,
} from '../../services/report/report-dq.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表数据质量'];

const listRulesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/rules', tags, summary: '质量规则列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { query: PaginationQuery.extend({
      datasetId: z.coerce.number().int().positive().optional(),
      type: reportDqRuleTypeSchema.optional(),
      enabled: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportDqRuleDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportDqRules(c.req.valid('query'))), 200),
});

const getRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/rules/{id}', tags, summary: '质量规则详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportDqRuleDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportDqRule(c.req.valid('param').id)), 200),
});

const createRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rules', tags, summary: '创建质量规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:create', audit: { module: '报表数据质量', description: '创建质量规则' } })] as const,
    request: { body: { content: jsonContent(createReportDqRuleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDqRuleDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportDqRule(c.req.valid('json')), '创建成功'), 200),
});

const updateRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/rules/{id}', tags, summary: '更新质量规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:update', audit: { module: '报表数据质量', description: '更新质量规则' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportDqRuleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDqRuleDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportDqRule(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const deleteRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/rules/{id}', tags, summary: '删除质量规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:delete', audit: { module: '报表数据质量', description: '删除质量规则' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportDqRule(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const toggleRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rules/{id}/toggle', tags, summary: '启停质量规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:update', audit: { module: '报表数据质量', description: '启停质量规则' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportDqRuleDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(await toggleReportDqRule(c.req.valid('param').id), '操作成功'), 200),
});

const runRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rules/{id}/run', tags, summary: '异步执行质量规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:run', audit: { module: '报表数据质量', description: '执行质量规则' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(runReportDqRuleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(AsyncTaskDTO, '任务已提交') },
  }),
  handler: async (c) => c.json(okBody(await submitReportDqRuleRun(c.req.valid('param').id, c.req.valid('json')), '任务已提交'), 200),
});

const listRunsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/runs', tags, summary: '质量运行历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { query: PaginationQuery.extend({
      datasetId: z.coerce.number().int().positive().optional(),
      ruleId: z.coerce.number().int().positive().optional(),
      status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportDqRunDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportDqRuns(c.req.valid('query'))), 200),
});

const scoreHistoryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/datasets/{id}/scores', tags, summary: '数据集质量评分历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { params: IdParam, query: PaginationQuery },
    responses: { ...commonErrorResponses, ...okPaginated(ReportDqScoreDTO, 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listReportDqScores(c.req.valid('param').id, query.page, query.pageSize)), 200);
  },
});

const currentScoreRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/datasets/{id}/score', tags, summary: '数据集当前质量评分',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportDqScoreDTO.nullable(), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getCurrentReportDqScore(c.req.valid('param').id)), 200),
});

const listAnomaliesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/anomalies', tags, summary: '质量异常列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:list' })] as const,
    request: { query: PaginationQuery.extend({
      datasetId: z.coerce.number().int().positive().optional(),
      status: z.enum(['open', 'acknowledged', 'resolved', 'ignored']).optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportDqAnomalyDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportDqAnomalies(c.req.valid('query'))), 200),
});

const anomalyStatusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/anomalies/{id}/status', tags, summary: '确认或解决质量异常',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dq:update', audit: { module: '报表数据质量', description: '更新质量异常状态' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportDqAnomalyStatusSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDqAnomalyDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportDqAnomalyStatus(c.req.valid('param').id, c.req.valid('json')), '操作成功'), 200),
});

router.openapiRoutes([
  listRulesRoute, getRuleRoute, createRuleRoute, updateRuleRoute, deleteRuleRoute, toggleRuleRoute,
  runRuleRoute, listRunsRoute, scoreHistoryRoute, currentScoreRoute, listAnomaliesRoute, anomalyStatusRoute,
] as const);

export default router;
