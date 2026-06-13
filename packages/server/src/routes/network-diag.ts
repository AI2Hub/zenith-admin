import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { stream } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../middleware/auth';
import {
  validationHook, ok, commonErrorResponses, okBody,
} from '../lib/openapi-schemas';
import { spawnNetDiag, runNslookup, checkPort, validateHost, type NetDiagType } from '../services/network-diag.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

// ─── 流式路由：ping / traceroute（不走 OpenAPI，因为 stream() 返回值不兼容 OpenAPI 类型系统）────
router.get('/stream', authMiddleware, async (c) => {
  const type = c.req.query('type') as NetDiagType;
  const host = c.req.query('host') ?? '';

  if (!type || !['ping', 'traceroute'].includes(type) || !host) {
    return c.json({ code: 400, message: '参数错误', data: null }, 400);
  }

  try {
    validateHost(host);
  } catch {
    return c.json({ code: 400, message: '非法主机名或 IP', data: null }, 400);
  }

  const { kill, lines } = spawnNetDiag(type, host);

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

const nslookupRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/nslookup', summary: 'DNS 查询', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: { query: z.object({ host: z.string().min(1).max(253) }) },
    responses: { ...commonErrorResponses, ...ok(z.object({ output: z.string() }), 'DNS 查询结果') },
  }),
  handler: async (c) => {
    const { host } = c.req.valid('query');
    const output = await runNslookup(host);
    return c.json(okBody({ output }), 200);
  },
});

const portCheckRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/port-check', summary: 'TCP 端口检测', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              host: z.string().min(1).max(253),
              port: z.number().int().min(1).max(65535),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(z.object({ open: z.boolean(), latencyMs: z.number() }), '端口检测结果'),
    },
  }),
  handler: async (c) => {
    const { host, port } = c.req.valid('json');
    try { validateHost(host); } catch { throw new HTTPException(400, { message: '非法主机名或 IP' }); }
    const result = await checkPort(host, port);
    return c.json(okBody(result), 200);
  },
});

router.openapiRoutes([nslookupRoute, portCheckRoute] as const);

export default router;
