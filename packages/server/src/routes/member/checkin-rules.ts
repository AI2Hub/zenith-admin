import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  ok,
  okMsg,
  okBody,
  IdParam,
  jsonContent,
  validationHook,
  commonErrorResponses,
} from '../../lib/openapi-schemas';
import { CheckinRuleDTO } from '../../lib/openapi-dtos';
import {
  listCheckinRules,
  createCheckinRule,
  updateCheckinRule,
  deleteCheckinRule,
  ensureCheckinRuleExists,
} from '../../services/member/checkin-rules.service';

const checkinRulesRouter = new OpenAPIHono({ defaultHook: validationHook });

const ruleBody = z.object({
  dayNumber: z.number().int().min(1),
  points: z.number().int().min(0).default(0),
  experience: z.number().int().min(0).default(0),
  remark: z.string().max(256).nullable().optional(),
});

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['会员签到'],
    summary: '签到规则列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:rule:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(CheckinRuleDTO), '签到规则列表') },
  }),
  handler: async (c) => c.json(okBody(await listCheckinRules()), 200),
});

const createRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['会员签到'],
    summary: '创建签到规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:rule:create', audit: { module: '会员签到', description: '创建签到规则' } })] as const,
    request: { body: { content: jsonContent(ruleBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(CheckinRuleDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createCheckinRule(c.req.valid('json')), '创建成功'), 200),
});

const updateRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['会员签到'],
    summary: '更新签到规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:rule:update', audit: { module: '会员签到', description: '更新签到规则' } })] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(ruleBody.partial()), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(CheckinRuleDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureCheckinRuleExists(id));
    return c.json(okBody(await updateCheckinRule(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRuleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['会员签到'],
    summary: '删除签到规则',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:rule:delete', audit: { module: '会员签到', description: '删除签到规则' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureCheckinRuleExists(id));
    await deleteCheckinRule(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

checkinRulesRouter.openapiRoutes([listRoute, createRuleRoute, updateRuleRoute, deleteRuleRoute] as const);

export default checkinRulesRouter;
