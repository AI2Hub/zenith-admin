import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import {
  validationHook,
  commonErrorResponses,
  ok,
  okBody,
} from '../lib/openapi-schemas';
import { getListeningPorts } from '../services/ports.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const PortEntryDTO = z.object({
  protocol: z.string(),
  localAddress: z.string(),
  localPort: z.number().int(),
  state: z.string(),
  pid: z.number().int().nullable(),
  processName: z.string().nullable(),
});

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['Ports'], summary: '获取监听端口列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:process:view' })] as const,
    responses: { ...commonErrorResponses, ...ok(PortEntryDTO.array(), '端口列表') },
  }),
  handler: async (c) => {
    const ports = await getListeningPorts();
    return c.json(okBody(ports), 200);
  },
});

router.openapiRoutes([listRoute] as const);

export default router;
