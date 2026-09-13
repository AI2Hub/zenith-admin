import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowScheduleContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow, getWorkflowSchedule } from '../../services/workflow/workflow-schedules.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const runNowRoute = defineContractRoute(workflowScheduleContract.run, {
  middleware: [authMiddleware, guard({ permission: 'workflow:schedule:edit', audit: { description: '手动触发定时发起', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getWorkflowSchedule(id));
    return c.json(okBody(await runScheduleNow(id), '已触发一次执行'), 200);
  },
});

mountCrud(router, workflowScheduleContract,
  {
    list: listSchedules,
    get: getWorkflowSchedule,
    create: createSchedule,
    update: updateSchedule,
    remove: deleteSchedule,
  },
  {
    permission: { read: 'workflow:schedule:list', create: 'workflow:schedule:create', update: 'workflow:schedule:edit', remove: 'workflow:schedule:delete' },
    label: '定时发起',
    module: '工作流管理',
    audit: { create: '新建定时发起' },
    messages: { create: '已创建', update: '已更新', remove: '已删除' },
  },
  [runNowRoute],
);

export default router;
