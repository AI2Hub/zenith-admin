import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  applyReportAssetTemplateSchema,
  cloneReportAssetTemplateSchema,
  createReportAssetTemplateSchema,
  createReportDeprecationNoticeSchema,
  publishReportDeprecationNoticeSchema,
  reportAssetTemplateTypeSchema,
  reportResourceTypeSchema,
  updateReportAssetTemplateSchema,
  updateReportDeprecationNoticeSchema,
} from '@zenith/shared';
import {
  ReportAssetCatalogItemDTO,
  ReportAssetTemplateApplyResultDTO,
  ReportAssetTemplateDTO,
  ReportAssetUsageSummaryDTO,
  ReportAssetUsageTrendPointDTO,
  ReportDeprecationNoticeDTO,
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
  applyReportAssetTemplate,
  cloneReportAssetTemplate,
  createReportAssetTemplate,
  createReportDeprecationNotice,
  deleteReportAssetTemplate,
  deleteReportDeprecationNotice,
  getReportAssetTemplate,
  getReportAssetUsageSummary,
  getReportAssetUsageTrend,
  listInactiveReportAssets,
  listReportAssetCatalog,
  listReportAssetTemplates,
  listReportDeprecationNotices,
  listTopReportAssets,
  publishReportDeprecationNotice,
  updateReportAssetTemplate,
  updateReportDeprecationNotice,
} from '../../services/report/report-asset.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表资产'];

const catalogRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/catalog', tags, summary: '资产目录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset:list' })] as const,
    request: { query: PaginationQuery.extend({
      keyword: z.string().max(128).optional(),
      types: z.string().optional(),
      ownerId: z.coerce.number().int().positive().optional(),
      folderId: z.coerce.number().int().positive().optional(),
      lifecycle: z.string().max(32).optional(),
      status: z.string().max(32).optional(),
      updatedStart: z.string().optional(),
      updatedEnd: z.string().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportAssetCatalogItemDTO, 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    const parsedTypes = query.types?.split(',').map((item) => reportResourceTypeSchema.safeParse(item.trim()))
      .filter((item) => item.success).map((item) => item.data);
    return c.json(okBody(await listReportAssetCatalog({ ...query, types: parsedTypes })), 200);
  },
});

const usageSummaryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/usage/{resourceType}/{id}', tags, summary: '资产使用影响',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset:usage' })] as const,
    request: {
      params: z.object({ resourceType: reportResourceTypeSchema, id: z.coerce.number().int().positive() }),
      query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }),
    },
    responses: { ...commonErrorResponses, ...ok(ReportAssetUsageSummaryDTO, 'ok') },
  }),
  handler: async (c) => {
    const params = c.req.valid('param');
    return c.json(okBody(await getReportAssetUsageSummary(params.resourceType, params.id, c.req.valid('query').days)), 200);
  },
});

const topAssetsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/usage/top', tags, summary: '高频资产',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset:usage' })] as const,
    request: { query: z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }) },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportAssetUsageSummaryDTO), 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listTopReportAssets(query.days, query.limit)), 200);
  },
});

const inactiveAssetsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/usage/inactive', tags, summary: '闲置资产',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset:usage' })] as const,
    request: { query: PaginationQuery.extend({ days: z.coerce.number().int().min(1).max(3650).default(90) }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportAssetCatalogItemDTO, 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listInactiveReportAssets(query.days, query.page, query.pageSize)), 200);
  },
});

const usageTrendRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/usage/trend', tags, summary: '资产使用趋势',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset:usage' })] as const,
    request: { query: z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
      bucket: z.enum(['hour', 'day']).default('day'),
      resourceType: reportResourceTypeSchema.optional(),
      resourceId: z.coerce.number().int().positive().optional(),
    }) },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportAssetUsageTrendPointDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportAssetUsageTrend(c.req.valid('query'))), 200),
});

const listNoticesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/deprecations', tags, summary: '弃用公告列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:deprecation:list' })] as const,
    request: { query: PaginationQuery.extend({
      resourceType: reportResourceTypeSchema.optional(),
      resourceId: z.coerce.number().int().positive().optional(),
      published: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportDeprecationNoticeDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportDeprecationNotices(c.req.valid('query'))), 200),
});

const createNoticeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/deprecations', tags, summary: '创建弃用公告',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:deprecation:create', audit: { module: '报表资产', description: '创建弃用公告' } })] as const,
    request: { body: { content: jsonContent(createReportDeprecationNoticeSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDeprecationNoticeDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportDeprecationNotice(c.req.valid('json')), '创建成功'), 200),
});

const updateNoticeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/deprecations/{id}', tags, summary: '更新弃用公告',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:deprecation:update', audit: { module: '报表资产', description: '更新弃用公告' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportDeprecationNoticeSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDeprecationNoticeDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportDeprecationNotice(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const publishNoticeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/deprecations/{id}/publish', tags, summary: '发布或撤销弃用公告',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:deprecation:publish', audit: { module: '报表资产', description: '发布或撤销弃用公告' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(publishReportDeprecationNoticeSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportDeprecationNoticeDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(await publishReportDeprecationNotice(
    c.req.valid('param').id,
    c.req.valid('json').publish,
  ), '操作成功'), 200),
});

const deleteNoticeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/deprecations/{id}', tags, summary: '删除弃用公告',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:deprecation:delete', audit: { module: '报表资产', description: '删除弃用公告' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportDeprecationNotice(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const listTemplatesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/templates', tags, summary: '资产模板列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:list' })] as const,
    request: { query: PaginationQuery.extend({
      keyword: z.string().max(128).optional(),
      type: reportAssetTemplateTypeSchema.optional(),
      status: z.enum(['enabled', 'disabled']).optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportAssetTemplateDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportAssetTemplates(c.req.valid('query'))), 200),
});

const getTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/templates/{id}', tags, summary: '资产模板详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportAssetTemplateDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportAssetTemplate(c.req.valid('param').id)), 200),
});

const createTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates', tags, summary: '创建资产模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:create', audit: { module: '报表资产', description: '创建资产模板' } })] as const,
    request: { body: { content: jsonContent(createReportAssetTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportAssetTemplateDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportAssetTemplate(c.req.valid('json')), '创建成功'), 200),
});

const updateTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/templates/{id}', tags, summary: '更新资产模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:update', audit: { module: '报表资产', description: '更新资产模板' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportAssetTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportAssetTemplateDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportAssetTemplate(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const cloneTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates/{id}/clone', tags, summary: '克隆资产模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:create', audit: { module: '报表资产', description: '克隆资产模板' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(cloneReportAssetTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportAssetTemplateDTO, '克隆成功') },
  }),
  handler: async (c) => c.json(okBody(await cloneReportAssetTemplate(c.req.valid('param').id, c.req.valid('json')), '克隆成功'), 200),
});

const applyTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates/{id}/apply', tags, summary: '应用资产模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:apply', audit: { module: '报表资产', description: '应用资产模板' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(applyReportAssetTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportAssetTemplateApplyResultDTO, '应用成功') },
  }),
  handler: async (c) => c.json(okBody(await applyReportAssetTemplate(c.req.valid('param').id, c.req.valid('json')), '应用成功'), 200),
});

const deleteTemplateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/templates/{id}', tags, summary: '删除资产模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:asset-template:delete', audit: { module: '报表资产', description: '删除资产模板' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportAssetTemplate(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([
  catalogRoute, usageSummaryRoute, topAssetsRoute, inactiveAssetsRoute, usageTrendRoute,
  listNoticesRoute, createNoticeRoute, updateNoticeRoute, publishNoticeRoute, deleteNoticeRoute,
  listTemplatesRoute, getTemplateRoute, createTemplateRoute, updateTemplateRoute,
  cloneTemplateRoute, applyTemplateRoute, deleteTemplateRoute,
] as const);

export default router;
