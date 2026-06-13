import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import {
  validationHook,
  commonErrorResponses,
  ok,
  okMsg,
  okBody,
} from '../lib/openapi-schemas';
import {
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  getContainerLogs,
  getContainerStats,
  inspectContainer,
} from '../services/docker.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const PERM = 'system:process:view';

const ContainerDTO = z.object({
  id: z.string(),
  shortId: z.string(),
  names: z.array(z.string()),
  image: z.string(),
  imageId: z.string(),
  command: z.string(),
  created: z.number(),
  state: z.string(),
  status: z.string(),
  ports: z.array(z.object({
    privatePort: z.number(),
    publicPort: z.number().optional(),
    type: z.string(),
  })),
  composeProject: z.string().nullable(),
  composeService: z.string().nullable(),
});

const ContainerIdParam = z.object({ id: z.string().min(1) });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['Docker'], summary: '容器列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM })] as const,
    responses: { ...commonErrorResponses, ...ok(ContainerDTO.array(), '容器列表') },
  }),
  handler: async (c) => {
    try {
      return c.json(okBody(await listContainers()), 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HTTPException(503, { message: `Docker 不可用: ${msg}` });
    }
  },
});

const startRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/:id/start', tags: ['Docker'], summary: '启动容器',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM, audit: { description: '启动 Docker 容器', module: '系统运维' } })] as const,
    request: { params: ContainerIdParam },
    responses: { ...commonErrorResponses, ...okMsg('启动成功') },
  }),
  handler: async (c) => {
    await startContainer(c.req.valid('param').id);
    return c.json(okBody(null, '启动成功'), 200);
  },
});

const stopRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/:id/stop', tags: ['Docker'], summary: '停止容器',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM, audit: { description: '停止 Docker 容器', module: '系统运维' } })] as const,
    request: { params: ContainerIdParam },
    responses: { ...commonErrorResponses, ...okMsg('停止成功') },
  }),
  handler: async (c) => {
    await stopContainer(c.req.valid('param').id);
    return c.json(okBody(null, '停止成功'), 200);
  },
});

const restartRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/:id/restart', tags: ['Docker'], summary: '重启容器',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM, audit: { description: '重启 Docker 容器', module: '系统运维' } })] as const,
    request: { params: ContainerIdParam },
    responses: { ...commonErrorResponses, ...okMsg('重启成功') },
  }),
  handler: async (c) => {
    await restartContainer(c.req.valid('param').id);
    return c.json(okBody(null, '重启成功'), 200);
  },
});

const logsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/:id/logs', tags: ['Docker'], summary: '获取容器日志',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM })] as const,
    request: {
      params: ContainerIdParam,
      query: z.object({ tail: z.coerce.number().int().min(10).max(5000).default(200) }),
    },
    responses: { ...commonErrorResponses, ...ok(z.object({ logs: z.string() }), '容器日志') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { tail } = c.req.valid('query');
    const logs = await getContainerLogs(id, Number(tail));
    return c.json(okBody({ logs }), 200);
  },
});

const statsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/:id/stats', tags: ['Docker'], summary: '获取容器资源占用',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM })] as const,
    request: { params: ContainerIdParam },
    responses: { ...commonErrorResponses, ...ok(z.object({ cpuPercent: z.number(), memUsage: z.number(), memLimit: z.number() }), '资源占用') },
  }),
  handler: async (c) => {
    const stats = await getContainerStats(c.req.valid('param').id);
    return c.json(okBody(stats), 200);
  },
});

const inspectRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/:id/inspect', tags: ['Docker'], summary: '容器详情（docker inspect）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: PERM })] as const,
    request: { params: ContainerIdParam },
    responses: { ...commonErrorResponses, ...ok(z.record(z.string(), z.unknown()), '容器详情') },
  }),
  handler: async (c) => {
    const info = await inspectContainer(c.req.valid('param').id);
    return c.json(okBody(info as unknown as Record<string, unknown>), 200);
  },
});

router.openapiRoutes([listRoute, startRoute, stopRoute, restartRoute, logsRoute, statsRoute, inspectRoute] as const);

export default router;
