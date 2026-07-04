import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { PaginationQuery, validationHook, commonErrorResponses, okPaginated, okBody } from '../../lib/openapi-schemas';
import { IpAccessLogDTO } from '../../lib/openapi-dtos';
import { listIpAccessLogs } from '../../services/platform/ip-access-logs.service';

const ipAccessLogsRoute = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['IpAccessLogs'], summary: 'IP 访问控制拦截日志分页查询',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:ip-access:log' })] as const,
    request: {
      query: PaginationQuery.extend({
        ip: z.string().optional(),
        blockType: z.enum(['blacklist', 'whitelist']).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }),
    },
    responses: { ...okPaginated(IpAccessLogDTO, 'IP 拦截日志列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listIpAccessLogs(c.req.valid('query'))), 200),
});

ipAccessLogsRoute.openapiRoutes([listRoute] as const);

export default ipAccessLogsRoute;
