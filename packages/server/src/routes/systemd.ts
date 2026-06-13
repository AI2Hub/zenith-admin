import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { stream } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../middleware/auth';
import {
  validationHook, ok, commonErrorResponses, okBody, okMsg,
} from '../lib/openapi-schemas';
import {
  isSystemdAvailable, listServices, controlService, getServiceLogs, tailServiceLogs,
} from '../services/systemd.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

/** 验证服务名：只允许合法字符，防止命令注入 */
function validateServiceName(name: string): void {
  if (!/^[a-zA-Z0-9_@.\-]{1,128}$/.test(name)) throw new HTTPException(400, { message: '非法服务名称' });
}

// ─── 流式路由：实时日志 ────────────────────────────────────────────────────────
router.get('/:name/logs/stream', authMiddleware, async (c) => {
  const name = c.req.param('name');
  try { validateServiceName(name); } catch {
    return c.json({ code: 400, message: '非法服务名称', data: null }, 400);
  }

  const { kill, lines } = tailServiceLogs(name);

  return stream(c, async (s) => {
    s.onAbort(() => kill());
    try {
      for await (const chunk of lines) {
        await s.write((chunk as Buffer).toString());
      }
    } catch { /* client disconnected */ } finally {
      kill();
    }
  });
});

// ─── OpenAPI 路由 ─────────────────────────────────────────────────────────────

const ServiceDTO = z.object({
  name: z.string(), description: z.string(),
  loadState: z.string(), activeState: z.string(), subState: z.string(),
});

const checkRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/check', summary: '检查 systemd 可用性', tags: ['Systemd'],
    middleware: [authMiddleware] as const,
    request: {},
    responses: { ...commonErrorResponses, ...ok(z.object({ available: z.boolean() }), 'systemd 可用性') },
  }),
  handler: async (c) => {
    const available = await isSystemdAvailable();
    return c.json(okBody({ available }), 200);
  },
});

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', summary: '列出 systemd 服务', tags: ['Systemd'],
    middleware: [authMiddleware] as const,
    request: {},
    responses: { ...commonErrorResponses, ...ok(z.array(ServiceDTO), '服务列表') },
  }),
  handler: async (c) => {
    const services = await listServices();
    return c.json(okBody(services), 200);
  },
});

const controlRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/:name/:action', summary: '控制服务（启动/停止/重启）', tags: ['Systemd'],
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ name: z.string(), action: z.enum(['start', 'stop', 'restart']) }),
    },
    responses: { ...commonErrorResponses, ...okMsg('操作成功') },
  }),
  handler: async (c) => {
    const { name, action } = c.req.valid('param');
    validateServiceName(name);
    await controlService(name, action);
    return c.json(okBody(null, '操作成功'), 200);
  },
});

const logsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/:name/logs', summary: '获取服务近期日志', tags: ['Systemd'],
    middleware: [authMiddleware] as const,
    request: { params: z.object({ name: z.string() }) },
    responses: { ...commonErrorResponses, ...ok(z.object({ logs: z.string() }), '服务日志') },
  }),
  handler: async (c) => {
    const { name } = c.req.valid('param');
    validateServiceName(name);
    const logs = await getServiceLogs(name, 200);
    return c.json(okBody({ logs }), 200);
  },
});

router.openapiRoutes([checkRoute, listRoute, controlRoute, logsRoute] as const);

export default router;
