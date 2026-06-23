import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { validationHook, commonErrorResponses, ok, okBody } from '../lib/openapi-schemas';
import { MpStatsDTO } from '../lib/openapi-dtos';
import { getMpStats } from '../services/mp-stats.service';

const mpStatsRouter = new OpenAPIHono({ defaultHook: validationHook });

const statsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号统计'], summary: '数据统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:statistics:view' })] as const,
    request: { query: z.object({ accountId: z.coerce.number().int().positive() }) },
    responses: { ...commonErrorResponses, ...ok(MpStatsDTO, '数据统计') },
  }),
  handler: async (c) => c.json(okBody(await getMpStats(c.req.valid('query').accountId)), 200),
});

mpStatsRouter.openapiRoutes([statsRoute] as const);

export default mpStatsRouter;
