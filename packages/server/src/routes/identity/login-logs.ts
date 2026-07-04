import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { PaginationQuery, validationHook, commonErrorResponses, ok, okPaginated, okBody, okMsg } from '../../lib/openapi-schemas';
import { LoginLogDTO, LoginLogStatsDTO } from '../../lib/openapi-dtos';
import { listLoginLogs, loginLogStats, cleanLoginLogs, getCleanLoginLogsBeforeAudit } from '../../services/identity/login-logs.service';

const loginLogsRoute = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['LoginLogs'], summary: '登录日志分页查询',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:log:login' })] as const,
    request: {
      query: PaginationQuery.extend({
        username: z.string().optional(),
        eventType: z.enum(['login', 'logout']).optional(),
        status: z.enum(['success', 'fail']).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }),
    },
    responses: { ...okPaginated(LoginLogDTO, '登录日志列表'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await listLoginLogs(c.req.valid('query'))), 200),
});

const statsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/stats', tags: ['LoginLogs'], summary: '登录日志统计',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:log:login' })] as const,
    request: { query: z.object({ days: z.coerce.number().optional() }) },
    responses: { ...ok(LoginLogStatsDTO, '统计结果'), ...commonErrorResponses },
  }),
  handler: async (c) => c.json(okBody(await loginLogStats(c.req.valid('query').days)), 200),
});

const cleanRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/clean', tags: ['LoginLogs'], summary: '清除登录日志',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({
      permission: 'system:log:login',
      audit: { description: '清除登录日志', module: '登录日志' },
    })] as const,
    request: { query: z.object({ months: z.coerce.number().int().min(0).default(0) }) },
    responses: { ...okMsg('清除成功'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const { months } = c.req.valid('query');
    const before = await getCleanLoginLogsBeforeAudit(months);
    setAuditBeforeData(c, before);
    const deleted = await cleanLoginLogs(months);
    setAuditAfterData(c, { months, deleted });
    return c.json(okBody(null, `共删除 ${deleted} 条登录日志`), 200);
  },
});

loginLogsRoute.openapiRoutes([listRoute, statsRoute, cleanRoute] as const);

export default loginLogsRoute;
