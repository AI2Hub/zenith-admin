import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { validationHook, commonErrorResponses, ok, okBody } from '../../lib/openapi-schemas';
import { AiUsageStatsDTO } from '../../lib/openapi-dtos';
import { getUsageStats } from '../../services/ai/ai-usage.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const StatsQuery = z.object({
  startDate: z.string().max(20).optional().openapi({ description: '起始日期 YYYY-MM-DD' }),
  endDate: z.string().max(20).optional().openapi({ description: '结束日期 YYYY-MM-DD' }),
});

const stats = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/stats',
    tags: ['AI'],
    summary: '获取 AI 用量统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'ai:usage:view' })] as const,
    request: { query: StatsQuery },
    responses: { ...commonErrorResponses, ...ok(AiUsageStatsDTO, '用量统计') },
  }),
  handler: async (c) => {
    const { startDate, endDate } = c.req.valid('query');
    return c.json(okBody(await getUsageStats({ startDate, endDate })), 200);
  },
});

router.openapiRoutes([stats] as const);

export default router;
