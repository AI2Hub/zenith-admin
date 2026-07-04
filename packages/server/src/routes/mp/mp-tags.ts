import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../../lib/openapi-schemas';
import { createMpTagSchema, updateMpTagSchema } from '@zenith/shared';
import { MpTagDTO, MpTagSyncResultDTO } from '../../lib/openapi-dtos';
import {
  listMpTags, createMpTag, updateMpTag, deleteMpTag, getMpTagBeforeAudit, syncMpTags,
} from '../../services/mp/mp-tag.service';

const mpTagsRouter = new OpenAPIHono({ defaultHook: validationHook });

const syncBodySchema = z.object({ accountId: z.number().int().positive() });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['公众号标签'], summary: '标签列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:tag:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        accountId: z.coerce.number().int().positive(),
        keyword: z.string().optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...okPaginated(MpTagDTO, '标签列表') },
  }),
  handler: async (c) => c.json(okBody(await listMpTags(c.req.valid('query'))), 200),
});

const syncRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/sync', tags: ['公众号标签'], summary: '从微信同步标签',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:tag:sync', audit: { description: '同步公众号标签', module: '公众号标签' } })] as const,
    request: { body: { content: jsonContent(syncBodySchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTagSyncResultDTO, '同步完成') },
  }),
  handler: async (c) => c.json(okBody(await syncMpTags(c.req.valid('json').accountId), '同步完成'), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['公众号标签'], summary: '创建标签',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:tag:create', audit: { description: '创建公众号标签', module: '公众号标签' } })] as const,
    request: { body: { content: jsonContent(createMpTagSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTagDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createMpTag(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['公众号标签'], summary: '更新标签',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:tag:update', audit: { description: '更新公众号标签', module: '公众号标签' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateMpTagSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MpTagDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpTagBeforeAudit(id));
    return c.json(okBody(await updateMpTag(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['公众号标签'], summary: '删除标签',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'mp:tag:delete', audit: { description: '删除公众号标签', module: '公众号标签' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpTagBeforeAudit(id));
    await deleteMpTag(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mpTagsRouter.openapiRoutes([listRoute, syncRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default mpTagsRouter;
