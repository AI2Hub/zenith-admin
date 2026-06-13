import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { stream } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../middleware/auth';
import {
  validationHook, ok, commonErrorResponses, okBody,
} from '../lib/openapi-schemas';
import { readLastLines, spawnTailFollow, validateLogPath } from '../services/log-viewer.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

// ─── 流式路由：tail -f ───────────────────────────────────────────────────────
router.get('/stream', authMiddleware, async (c) => {
  const filePath = c.req.query('path') ?? '';
  if (!filePath) {
    return c.json({ code: 400, message: '参数 path 不能为空', data: null }, 400);
  }
  try {
    validateLogPath(filePath);
  } catch (e) {
    return c.json({ code: 400, message: (e as Error).message, data: null }, 400);
  }

  const { kill, lines } = spawnTailFollow(filePath);

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

const contentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/content', summary: '读取日志文件末尾内容', tags: ['LogViewer'],
    middleware: [authMiddleware] as const,
    request: {
      query: z.object({
        path: z.string().min(1),
        lines: z.string().optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...ok(z.object({ content: z.string() }), '日志内容') },
  }),
  handler: async (c) => {
    const { path: filePath, lines } = c.req.valid('query');
    try { validateLogPath(filePath); } catch (e) {
      throw new HTTPException(400, { message: (e as Error).message });
    }
    const lineCount = Math.min(Number.parseInt(lines ?? '500', 10) || 500, 5000);
    const content = await readLastLines(filePath, lineCount);
    return c.json(okBody({ content }), 200);
  },
});

router.openapiRoutes([contentRoute] as const);

export default router;
