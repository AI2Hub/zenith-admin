import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportSlaRuleSchema,
  reportSlaTypeSchema,
  updateReportSlaRuleSchema,
  updateReportSlaViolationSchema,
} from '@zenith/shared';
import { AsyncTaskDTO, ReportSlaRuleDTO, ReportSlaViolationDTO } from '../../lib/openapi-dtos';
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
  createReportSlaRule,
  deleteReportSlaRule,
  getReportSlaRule,
  listReportSlaRules,
  listReportSlaViolations,
  submitReportSlaEvaluation,
  updateReportSlaRule,
  updateReportSlaViolation,
} from '../../services/report/report-sla.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表 SLA'];

const listRulesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/rules', tags, summary: 'SLA 规则列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:list' })] as const,
    request: { query: PaginationQuery.extend({
      datasetId: z.coerce.number().int().positive().optional(),
      type: reportSlaTypeSchema.optional(),
      enabled: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportSlaRuleDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportSlaRules(c.req.valid('query'))), 200),
});

const getRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/rules/{id}', tags, summary: 'SLA 规则详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportSlaRuleDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportSlaRule(c.req.valid('param').id)), 200),
});

const createRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rules', tags, summary: '创建 SLA 规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:create', audit: { module: '报表 SLA', description: '创建 SLA 规则' } })] as const,
    request: { body: { content: jsonContent(createReportSlaRuleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportSlaRuleDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportSlaRule(c.req.valid('json')), '创建成功'), 200),
});

const updateRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/rules/{id}', tags, summary: '更新 SLA 规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:update', audit: { module: '报表 SLA', description: '更新 SLA 规则' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportSlaRuleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportSlaRuleDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportSlaRule(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const deleteRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/rules/{id}', tags, summary: '删除 SLA 规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:delete', audit: { module: '报表 SLA', description: '删除 SLA 规则' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportSlaRule(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const evaluateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/rules/{id}/evaluate', tags, summary: '异步评估 SLA',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:evaluate', audit: { module: '报表 SLA', description: '评估 SLA' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(AsyncTaskDTO, '任务已提交') },
  }),
  handler: async (c) => c.json(okBody(await submitReportSlaEvaluation(c.req.valid('param').id), '任务已提交'), 200),
});

const violationsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/violations', tags, summary: 'SLA 违规列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:list' })] as const,
    request: { query: PaginationQuery.extend({
      datasetId: z.coerce.number().int().positive().optional(),
      ruleId: z.coerce.number().int().positive().optional(),
      status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportSlaViolationDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportSlaViolations(c.req.valid('query'))), 200),
});

const violationStatusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/violations/{id}/status', tags, summary: '确认或解决 SLA 违规',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:sla:update', audit: { module: '报表 SLA', description: '更新 SLA 违规状态' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportSlaViolationSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportSlaViolationDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportSlaViolation(c.req.valid('param').id, c.req.valid('json')), '操作成功'), 200),
});

router.openapiRoutes([
  listRulesRoute, getRuleRoute, createRuleRoute, updateRuleRoute, deleteRuleRoute,
  evaluateRoute, violationsRoute, violationStatusRoute,
] as const);

export default router;
