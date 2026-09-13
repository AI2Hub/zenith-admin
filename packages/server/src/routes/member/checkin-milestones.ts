import { OpenAPIHono } from '@hono/zod-openapi';
import { checkinMilestoneContract } from '@zenith/shared/member';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listCheckinMilestones,
  createCheckinMilestone,
  updateCheckinMilestone,
  deleteCheckinMilestone,
  ensureMilestoneExists,
} from '../../services/member/checkin-milestones.service';
import { mountCrud } from '../_crud';

const checkinMilestonesRouter = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineContractRoute(checkinMilestoneContract.list, {
  middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:list' })],
  handler: async (c) => c.json(okBody(await listCheckinMilestones()), 200),
});
const updateMilestoneRoute = defineContractRoute(checkinMilestoneContract.update, {
  middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:update', audit: { module: '会员签到', description: '更新签到里程碑' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureMilestoneExists(id));
    return c.json(okBody(await updateCheckinMilestone(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteMilestoneRoute = defineContractRoute(checkinMilestoneContract.remove, {
  middleware: [authMiddleware, guard({ permission: 'member:checkin:milestone:delete', audit: { module: '会员签到', description: '删除签到里程碑' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await ensureMilestoneExists(id));
    await deleteCheckinMilestone(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mountCrud(checkinMilestonesRouter, checkinMilestoneContract,
  { create: createCheckinMilestone },
  {
    permission: 'member:checkin:milestone',
    label: '签到里程碑',
    module: '会员签到',
    exclude: ['list', 'update', 'remove'],
  },
  [listRoute, updateMilestoneRoute, deleteMilestoneRoute],
);

export default checkinMilestonesRouter;
