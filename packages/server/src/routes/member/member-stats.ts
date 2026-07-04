import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { validationHook, commonErrorResponses, ok, okBody } from '../../lib/openapi-schemas';
import { MemberStatsOverviewDTO, MemberStatsChartsDTO } from '../../lib/openapi-dtos';
import { getMemberStats, getMemberCharts } from '../../services/member/member-stats.service';

const memberStatsRouter = new OpenAPIHono({ defaultHook: validationHook });

const overviewRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/overview', tags: ['会员看板'], summary: '会员统计概览',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:dashboard:view' })] as const,
    responses: { ...commonErrorResponses, ...ok(MemberStatsOverviewDTO, '会员统计概览') },
  }),
  handler: async (c) => c.json(okBody(await getMemberStats()), 200),
});

const chartsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/charts', tags: ['会员看板'], summary: '会员统计图表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:dashboard:view' })] as const,
    responses: { ...commonErrorResponses, ...ok(MemberStatsChartsDTO, '会员统计图表') },
  }),
  handler: async (c) => c.json(okBody(await getMemberCharts()), 200),
});

memberStatsRouter.openapiRoutes([overviewRoute, chartsRoute] as const);

export default memberStatsRouter;
