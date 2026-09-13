// ─── 批量操作（含审计快照聚合）───
import { workflowInstanceContract, workflowTaskContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../../middleware/auth';
import { guard } from '../../../middleware/guard';
import { idempotencyGuard } from '../../../middleware/idempotency';
import { defineContractRoute } from '../../../lib/contract-route';
import { getWorkflowInstanceBeforeAudit, getWorkflowTaskBeforeAudit, batchApproveTasks, batchRejectTasks, batchWithdrawInstances, batchUrgeInstances } from '../../../services/workflow/workflow-instances.service';
import { runBatchWithAudit } from './_batch-audit';

export { compactAuditData } from './_batch-audit';

export const batchApproveRoute = defineContractRoute(workflowTaskContract.batchApprove, {
  middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 10 }), guard({ permission: 'workflow:task:handle', audit: { description: '批量审批通过', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { taskIds, comment } = c.req.valid('json');
    return c.json(await runBatchWithAudit(c, taskIds, () => batchApproveTasks(taskIds, comment), getWorkflowTaskBeforeAudit), 200);
  },
});

export const batchRejectRoute = defineContractRoute(workflowTaskContract.batchReject, {
  middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 10 }), guard({ permission: 'workflow:task:handle', audit: { description: '批量审批驳回', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { taskIds, comment } = c.req.valid('json');
    return c.json(await runBatchWithAudit(c, taskIds, () => batchRejectTasks(taskIds, comment), getWorkflowTaskBeforeAudit), 200);
  },
});

export const batchWithdrawRoute = defineContractRoute(workflowInstanceContract.batchWithdraw, {
  middleware: [authMiddleware, guard({ permission: 'workflow:instance:create', audit: { description: '批量撤回流程', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { instanceIds, comment } = c.req.valid('json');
    return c.json(await runBatchWithAudit(c, instanceIds, () => batchWithdrawInstances(instanceIds, comment), getWorkflowInstanceBeforeAudit), 200);
  },
});

export const batchUrgeRoute = defineContractRoute(workflowInstanceContract.batchUrge, {
  middleware: [authMiddleware, guard({ permission: 'workflow:instance:list', audit: { description: '批量催办流程', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { instanceIds, message } = c.req.valid('json');
    return c.json(await runBatchWithAudit(c, instanceIds, () => batchUrgeInstances(instanceIds, message)), 200);
  },
});
