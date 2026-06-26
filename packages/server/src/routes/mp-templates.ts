import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../lib/openapi-schemas';
import { sendMpTemplateSchema, setMpTemplateIndustrySchema, batchSendMpTemplateSchema } from '@zenith/shared';
import { MpMessageTemplateDTO, MpTemplateSendLogDTO, MpTagSyncResultDTO, MpTemplateIndustryDTO, MpBatchSendResultDTO } from '../lib/openapi-dtos';
import {
  listMpTemplates, deleteMpTemplate, syncMpTemplates, sendMpTemplate, listMpTemplateSendLogs,
  setMpTemplateIndustry, getMpTemplateIndustry, batchSendMpTemplate, getMpTemplateBeforeAudit, getMpTemplateIndustryBeforeAudit,
} from '../services/mp-template.service';

const mpTemplatesRouter = new OpenAPIHono({ defaultHook: validationHook });

const syncBody = z.object({ accountId: z.number().int().positive() });

async function getTemplateIndustryAuditSafe(accountId: number) {
  try {
    return await getMpTemplateIndustryBeforeAudit(accountId);
  } catch (err) {
    return {
      accountId,
      industry: null,
      auditError: err instanceof Error ? err.message : '获取行业信息失败',
    };
  }
}

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
    setAuditBeforeData(c, await getMpTemplateBeforeAudit(id));
    await deleteMpTemplate(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const industryGetRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/industry', tags: ['公众号模板消息'], summary: '获取所属行业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:list' })] as const,
    request: { query: z.object({ accountId: z.coerce.number().int().positive() }) },
    responses: { ...commonErrorResponses, ...ok(MpTemplateIndustryDTO, '行业信息') },
  }),
  handler: async (c) => c.json(okBody(await getMpTemplateIndustry(c.req.valid('query').accountId)), 200),
});

const industrySetRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/industry', tags: ['公众号模板消息'], summary: '设置所属行业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:sync', audit: { description: '设置模板行业', module: '公众号模板消息' } })] as const,
    request: { body: { content: jsonContent(setMpTemplateIndustrySchema), required: true } },
    responses: { ...commonErrorResponses, ...okMsg('设置成功') },
  }),
  handler: async (c) => {
    const b = c.req.valid('json');
    setAuditBeforeData(c, await getTemplateIndustryAuditSafe(b.accountId));
    await setMpTemplateIndustry(b.accountId, b.industryId1, b.industryId2);
    setAuditAfterData(c, await getTemplateIndustryAuditSafe(b.accountId));
    return c.json(okBody(null, '设置成功'), 200);
  },
});

const batchSendRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/batch-send', tags: ['公众号模板消息'], summary: '批量发送模板消息',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:template:send', audit: { description: '批量发送模板消息', module: '公众号模板消息' } })] as const,
    request: { body: { content: jsonContent(batchSendMpTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpBatchSendResultDTO, '已提交批量发送') },
  }),
  handler: async (c) => c.json(okBody(await batchSendMpTemplate(c.req.valid('json')), '已提交批量发送'), 200),
});

mpTemplatesRouter.openapiRoutes([logsRoute, industryGetRoute, industrySetRoute, batchSendRoute, listRoute, syncRoute, sendRoute, deleteRoute] as const);

export default mpTemplatesRouter;
