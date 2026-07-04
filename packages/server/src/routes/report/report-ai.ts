import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { reportNl2SqlSchema } from '@zenith/shared';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { jsonContent, validationHook, commonErrorResponses, ok, okBody } from '../../lib/openapi-schemas';
import { ReportNl2SqlResultDTO } from '../../lib/openapi-dtos';
import { generateReportSql } from '../../services/report/report-ai.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const nl2sqlRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/nl2sql',
    tags: ['报表 AI'], summary: 'AI 自然语言取数（生成只读 SQL）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:dataset:create' })] as const,
    request: { body: { content: jsonContent(reportNl2SqlSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportNl2SqlResultDTO, '生成结果') },
  }),
  handler: async (c) => c.json(okBody(await generateReportSql(c.req.valid('json'))), 200),
});

router.openapiRoutes([nl2sqlRoute] as const);

export default router;
