import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportEnvironmentPromotionSchema,
  createReportEnvironmentSchema,
  reportEnvironmentPromotionActionSchema,
  reportPromotionStatusSchema,
  reportResourceTypeSchema,
  updateReportEnvironmentSchema,
} from '@zenith/shared';
import {
  ReportEnvironmentDTO,
  ReportEnvironmentPromotionDTO,
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
  createReportEnvironment,
  createReportEnvironmentPromotion,
  deleteReportEnvironment,
  listReportEnvironmentPromotions,
  listReportEnvironments,
  transitionReportEnvironmentPromotion,
  updateReportEnvironment,
} from '../../services/report/report-governance.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['报表环境治理'], summary: '环境列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(ReportEnvironmentDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportEnvironments()), 200),
});

const createRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['报表环境治理'], summary: '创建环境',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:create', audit: { module: '报表环境治理', description: '创建报表环境' } })] as const,
    request: { body: { content: jsonContent(createReportEnvironmentSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportEnvironmentDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportEnvironment(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['报表环境治理'], summary: '更新环境',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:update', audit: { module: '报表环境治理', description: '更新报表环境' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportEnvironmentSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportEnvironmentDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportEnvironment(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const deleteRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['报表环境治理'], summary: '删除环境',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:delete', audit: { module: '报表环境治理', description: '删除报表环境' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportEnvironment(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const listPromotionsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/promotions', tags: ['报表环境治理'], summary: '资源发布历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:promote' })] as const,
    request: { query: PaginationQuery.extend({ status: reportPromotionStatusSchema.optional(), resourceType: reportResourceTypeSchema.optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportEnvironmentPromotionDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportEnvironmentPromotions(c.req.valid('query'))), 200),
});

const createPromotionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/promotions', tags: ['报表环境治理'], summary: '创建资源发布',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:promote', audit: { module: '报表环境治理', description: '创建资源发布' } })] as const,
    request: { body: { content: jsonContent(createReportEnvironmentPromotionSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportEnvironmentPromotionDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportEnvironmentPromotion(c.req.valid('json')), '创建成功'), 200),
});

const transitionPromotionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/promotions/{id}/transition', tags: ['报表环境治理'], summary: '审批、部署、取消或回滚资源发布',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:environment:promote', audit: { module: '报表环境治理', description: '变更资源发布状态' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(reportEnvironmentPromotionActionSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportEnvironmentPromotionDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(await transitionReportEnvironmentPromotion(c.req.valid('param').id, c.req.valid('json')), '操作成功'), 200),
});

router.openapiRoutes([
  listPromotionsRoute, createPromotionRoute, transitionPromotionRoute,
  listRoute, createRoute_, updateRoute_, deleteRoute_,
] as const);

export default router;
