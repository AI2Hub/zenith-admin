/**
 * 链路追踪查看器
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { traceContract } from '@zenith/shared/platform';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { getTraceTimeline, listRecentTraceFailures } from '../../services/platform/trace.service';

const traceRouter = new OpenAPIHono({ defaultHook: validationHook });

// 静态路由须早于 /{traceId}
const recentFailuresRoute = defineContractRoute(traceContract.recentFailures, {
  handler: async (c) => c.json(okBody(await listRecentTraceFailures(c.req.valid('query'))), 200),
});

const timelineRoute = defineContractRoute(traceContract.timeline, {
  handler: async (c) => {
    const { traceId } = c.req.valid('param');
    return c.json(okBody(await getTraceTimeline(traceId)), 200);
  },
});

traceRouter.openapiRoutes([recentFailuresRoute, timelineRoute] as const);

export default traceRouter;
