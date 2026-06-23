import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../lib/openapi-schemas';
import { sendMpTemplateSchema } from '@zenith/shared';
import { MpMessageTemplateDTO, MpTemplateSendLogDTO, MpTagSyncResultDTO } from '../lib/openapi-dtos';
import {
  listMpTemplates, deleteMpTemplate, syncMpTemplates, sendMpTemplate, listMpTemplateSendLogs,
} from '../services/mp-template.service';

const mpTemplatesRouter = new OpenAPIHono({ defaultHook: validationHook });

const syncBody = z.object({ accountId: z.number().int().positive() });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号模板消息'], summary: '模板列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:list' })] as const,
    request: { query: PaginationQuery.extend({ accountId: z.coerce.number().int().positive(), keyword: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(MpMessageTemplateDTO, '模板列表') },
  }),
  handler: async (c) => c.json(okBody(await listMpTemplates(c.req.valid('query'))), 200),
});

const logsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/logs', tags: ['公众号模板消息'], summary: '发送记录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        accountId: z.coerce.number().int().positive(),
        status: z.enum(['success', 'failed']).optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...okPaginated(MpTemplateSendLogDTO, '发送记录') },
  }),
  handler: async (c) => c.json(okBody(await listMpTemplateSendLogs(c.req.valid('query'))), 200),
});

const syncRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sync', tags: ['公众号模板消息'], summary: '从微信同步模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:sync', audit: { description: '同步模板消息', module: '公众号模板消息' } })] as const,
    request: { body: { content: jsonContent(syncBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTagSyncResultDTO, '同步完成') },
  }),
  handler: async (c) => c.json(okBody(await syncMpTemplates(c.req.valid('json').accountId), '同步完成'), 200),
});

const sendRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/send', tags: ['公众号模板消息'], summary: '发送模板消息',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:send', audit: { description: '发送模板消息', module: '公众号模板消息' } })] as const,
    request: { body: { content: jsonContent(sendMpTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTemplateSendLogDTO, '发送成功') },
  }),
  handler: async (c) => c.json(okBody(await sendMpTemplate(c.req.valid('json')), '发送成功'), 200),
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['公众号模板消息'], summary: '删除模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:delete', audit: { description: '删除模板', module: '公众号模板消息' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await deleteMpTemplate(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mpTemplatesRouter.openapiRoutes([logsRoute, listRoute, syncRoute, sendRoute, deleteRoute] as const);

export default mpTemplatesRouter;
