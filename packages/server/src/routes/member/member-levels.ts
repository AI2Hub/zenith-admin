import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  ErrorResponse, jsonContent, validationHook, commonErrorResponses,
  ok, okMsg, okBody, IdParam,
} from '../../lib/openapi-schemas';
import { MemberLevelDTO } from '../../lib/openapi-dtos';
import {
  listLevels, getLevel, createLevel, updateLevel, deleteLevel, ensureLevelExists,
} from '../../services/member/member-levels.service';

const levelsRouter = new OpenAPIHono({ defaultHook: validationHook });

const createLevelSchema = z.object({
  name: z.string().min(1).max(32),
  level: z.number().int().min(0),
  growthThreshold: z.number().int().min(0),
  discount: z.number().int().min(1).max(100),
  icon: z.string().max(256).nullable().optional(),
  benefits: z.array(z.string()).optional(),
  description: z.string().max(256).nullable().optional(),
  sort: z.number().int().optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
});
const updateLevelSchema = createLevelSchema.partial();

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['会员等级'], summary: '会员等级列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:level:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(MemberLevelDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listLevels()), 200),
});

const getOneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['会员等级'], summary: '等级详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:level:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(MemberLevelDTO, 'ok'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => c.json(okBody(await getLevel(c.req.valid('param').id)), 200),
});

const createRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['会员等级'], summary: '创建等级',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:level:create', audit: { description: '创建会员等级', module: '会员等级' } })] as const,
    request: { body: { content: jsonContent(createLevelSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MemberLevelDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createLevel(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['会员等级'], summary: '更新等级',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:level:update', audit: { description: '更新会员等级', module: '会员等级' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateLevelSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(MemberLevelDTO, '更新成功'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureLevelExists(id));
    return c.json(okBody(await updateLevel(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['会员等级'], summary: '删除等级',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:level:delete', audit: { description: '删除会员等级', module: '会员等级' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureLevelExists(id));
    await deleteLevel(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

levelsRouter.openapiRoutes([listRoute, getOneRoute, createRoute_, updateRoute_, deleteRoute_] as const);

export default levelsRouter;
