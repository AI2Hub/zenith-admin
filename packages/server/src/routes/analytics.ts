import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { validationHook, commonErrorResponses, ok, okMsg, okBody } from '../lib/openapi-schemas';
import {
  BatchUserEventsBodyDTO,
  PageStatsDTO,
  FeatureStatsDTO,
  HeatmapDataDTO,
  HeatmapPageListDTO,
} from '../lib/openapi-dtos';
import {
  batchInsertEvents,
  getPageStats,
  getFeatureStats,
  getHeatmapData,
  getHeatmapPageList,
} from '../services/analytics.service';

const analyticsRoute = new OpenAPIHono({ defaultHook: validationHook });

const ingestRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/events',
    tags: ['Analytics'],
    summary: '批量上报用户行为事件',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { body: { content: { 'application/json': { schema: BatchUserEventsBodyDTO } }, required: true } },
    responses: { ...okMsg('上报成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { events } = c.req.valid('json');
    await batchInsertEvents(events);
    return c.json(okBody(null, '上报成功'), 200);
  },
});

const pageStatsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/page-stats',
    tags: ['Analytics'],
    summary: '页面停留时长统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'analytics:view' })] as const,
    request: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      }),
    },
    responses: { ...ok(PageStatsDTO, '页面停留统计'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getPageStats(c.req.valid('query'))), 200),
});

const featureStatsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/feature-stats',
    tags: ['Analytics'],
    summary: '功能使用频率统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'analytics:view' })] as const,
    request: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
        limit: z.coerce.number().int().min(1).max(100).optional().default(30),
        pagePath: z.string().optional(),
      }),
    },
    responses: { ...ok(FeatureStatsDTO, '功能使用统计'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getFeatureStats(c.req.valid('query'))), 200),
});

const heatmapRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/heatmap',
    tags: ['Analytics'],
    summary: '点击热力图数据',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'analytics:view' })] as const,
    request: {
      query: z.object({
        pagePath: z.string().min(1),
        componentArea: z.string().min(1),
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
      }),
    },
    responses: { ...ok(HeatmapDataDTO, '热力图数据'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getHeatmapData(c.req.valid('query'))), 200),
});

const heatmapPagesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/heatmap-pages',
    tags: ['Analytics'],
    summary: '有热力图数据的页面列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'analytics:view' })] as const,
    request: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
      }),
    },
    responses: { ...ok(HeatmapPageListDTO, '页面列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await getHeatmapPageList(c.req.valid('query'))), 200),
});

analyticsRoute.openapiRoutes([ingestRoute, pageStatsRoute, featureStatsRoute, heatmapRoute, heatmapPagesRoute] as const);

export default analyticsRoute;
