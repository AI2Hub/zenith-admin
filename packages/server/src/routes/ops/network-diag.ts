import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { stream } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../../middleware/auth';
import {
  validationHook, ok, commonErrorResponses, okBody,
} from '../../lib/openapi-schemas';
import { spawnNetDiag, runNslookup, checkPort, validateHost, resolveDns, reverseDns, httpProbe, getInterfaces, type NetDiagType, type DnsRecordType } from '../../services/ops/network-diag.service';

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

const dnsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/dns', summary: 'DNS 记录解析（A/AAAA/MX/TXT/NS/CNAME/SOA）', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: { query: z.object({ host: z.string().min(1).max(253), type: z.enum(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA']).default('A') }) },
    responses: { ...commonErrorResponses, ...ok(z.object({ type: z.string(), records: z.array(z.string()) }), 'DNS 记录') },
  }),
  handler: async (c) => {
    const { host, type } = c.req.valid('query');
    try { validateHost(host); } catch { throw new HTTPException(400, { message: '非法主机名' }); }
    const result = await resolveDns(host, type as DnsRecordType);
    return c.json(okBody(result), 200);
  },
});

const reverseRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/reverse', summary: '反向 DNS（PTR）', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: { query: z.object({ ip: z.string().min(1).max(45) }) },
    responses: { ...commonErrorResponses, ...ok(z.object({ hostnames: z.array(z.string()) }), '反查结果') },
  }),
  handler: async (c) => {
    const { ip } = c.req.valid('query');
    try { const r = await reverseDns(ip); return c.json(okBody(r), 200); } catch (e) { throw new HTTPException(400, { message: (e as Error).message }); }
  },
});

const httpProbeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/http-probe', summary: 'HTTP(S) 探测', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: { body: { content: { 'application/json': { schema: z.object({ url: z.string().url().max(2048) }) } }, required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(z.object({
        ok: z.boolean(), status: z.number(), statusText: z.string(), latencyMs: z.number(),
        server: z.string().nullable(), contentType: z.string().nullable(), contentLength: z.string().nullable(),
        redirectLocation: z.string().nullable(), error: z.string().nullable(),
      }), 'HTTP 探测结果'),
    },
  }),
  handler: async (c) => {
    const { url } = c.req.valid('json');
    const result = await httpProbe(url);
    return c.json(okBody(result), 200);
  },
});

const interfacesRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/interfaces', summary: '本机网卡信息', tags: ['NetworkDiag'],
    middleware: [authMiddleware] as const,
    request: {},
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(z.object({
        name: z.string(), address: z.string(), netmask: z.string(), family: z.string(),
        mac: z.string(), internal: z.boolean(), cidr: z.string().nullable(),
      })), '网卡列表'),
    },
  }),
  handler: (c) => c.json(okBody(getInterfaces()), 200),
});

router.openapiRoutes([nslookupRoute, portCheckRoute, dnsRoute, reverseRoute, httpProbeRoute, interfacesRoute] as const);

export default router;
