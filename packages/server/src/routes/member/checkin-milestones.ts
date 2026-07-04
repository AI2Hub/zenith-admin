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
import { CheckinMilestoneDTO } from '../../lib/openapi-dtos';
import {
  listCheckinMilestones,
  createCheckinMilestone,
  updateCheckinMilestone,
  deleteCheckinMilestone,
  ensureMilestoneExists,
} from '../../services/member/checkin-milestones.service';

const checkinMilestonesRouter = new OpenAPIHono({ defaultHook: validationHook });

const milestoneBody = z.object({
  title: z.string().min(1).max(64),
  cumulativeDays: z.number().int().min(1),
  rewardType: z.enum(['points', 'coupon']),
  rewardPoints: z.number().int().min(0).default(0),
  couponId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().default(true),
  remark: z.string().max(256).nullable().optional(),
});

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['会员签到'],
    summary: '签到里程碑列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(CheckinMilestoneDTO), '签到里程碑列表') },
  }),
  handler: async (c) => c.json(okBody(await listCheckinMilestones()), 200),
});

const createMilestoneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['会员签到'],
    summary: '创建签到里程碑',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:create', audit: { module: '会员签到', description: '创建签到里程碑' } })] as const,
    request: { body: { content: jsonContent(milestoneBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(CheckinMilestoneDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createCheckinMilestone(c.req.valid('json')), '创建成功'), 200),
});

const updateMilestoneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['会员签到'],
    summary: '更新签到里程碑',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:update', audit: { module: '会员签到', description: '更新签到里程碑' } })] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(milestoneBody.partial()), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(CheckinMilestoneDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureMilestoneExists(id));
    return c.json(okBody(await updateCheckinMilestone(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteMilestoneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['会员签到'],
    summary: '删除签到里程碑',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:delete', audit: { module: '会员签到', description: '删除签到里程碑' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureMilestoneExists(id));
    await deleteCheckinMilestone(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

checkinMilestonesRouter.openapiRoutes([listRoute, createMilestoneRoute, updateMilestoneRoute, deleteMilestoneRoute] as const);

export default checkinMilestonesRouter;
