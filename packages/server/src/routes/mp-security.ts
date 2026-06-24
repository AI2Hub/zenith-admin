import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import {
  jsonContent, validationHook, commonErrorResponses, ok, okBody,
} from '../lib/openapi-schemas';
import { checkMpContentSchema } from '@zenith/shared';
import { MpContentCheckDTO } from '../lib/openapi-dtos';
import { checkMpContent } from '../services/mp-security.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const checkTextRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/check-text', tags: ['公众号内容安全'], summary: '文本内容安全校验',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:security:check' })] as const,
    request: { body: { content: jsonContent(checkMpContentSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpContentCheckDTO, '校验结果') },
  }),
  handler: async (c) => c.json(okBody(await checkMpContent(c.req.valid('json'))), 200),
});

router.openapiRoutes([checkTextRoute] as const);

export default router;
