// ─── 批量审批与跨实例批量操作（拆分自 workflow-instances.service.ts）───
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db';
import { workflowInstances, workflowTasks } from '../../../db/schema';
import type { WorkflowFlowData, WorkflowBatchActionResult } from '@zenith/shared';
import { findNextApproverSelectNodes } from '@zenith/shared';
import { HTTPException } from 'hono/http-exception';
import { currentUser } from '../../../lib/context';
import { urgeInstance } from './cc-urge';
import { withdrawInstance } from './lifecycle';
import { approveTask, rejectTask } from './task-actions';

export async function batchApproveTasks(taskIds: number[], comment?: string): Promise<WorkflowBatchActionResult[]> {
  const user = currentUser();
  const results: WorkflowBatchActionResult[] = [];
  for (const taskId of taskIds) {
    try {
      // 批量审批无法逐个为「下一节点自选审批人」指定人选 —— 提前识别这类任务并跳过，提示单独审批，
      // 避免被 assertSelectedNextApprovers 以「请选择节点的审批人」这种表单式文案拦截而语义不清。
      const [task] = await db.select({ nodeKey: workflowTasks.nodeKey, instanceId: workflowTasks.instanceId })
        .from(workflowTasks)
        .where(and(eq(workflowTasks.id, taskId), eq(workflowTasks.assigneeId, user.userId), eq(workflowTasks.status, 'pending')))
        .limit(1);
      if (task) {
        const [inst] = await db.select({ definitionSnapshot: workflowInstances.definitionSnapshot })
          .from(workflowInstances).where(eq(workflowInstances.id, task.instanceId)).limit(1);
        const flowData = (inst?.definitionSnapshot as { flowData?: WorkflowFlowData } | null)?.flowData;
        if (flowData && findNextApproverSelectNodes(flowData, task.nodeKey).length > 0) {
          results.push({ taskId, success: false, message: '需指定下一节点审批人，请单独审批' });
          continue;
        }
      }
      await approveTask(taskId, comment);
      results.push({ taskId, success: true });
    } catch (err) {
      results.push({ taskId, success: false, message: err instanceof HTTPException ? err.message : '处理失败' });
    }
  }
  return results;
}

export async function batchRejectTasks(taskIds: number[], comment: string): Promise<WorkflowBatchActionResult[]> {
  const results: WorkflowBatchActionResult[] = [];
  for (const taskId of taskIds) {
    try {
      await rejectTask(taskId, comment);
      results.push({ taskId, success: true });
    } catch (err) {
      results.push({ taskId, success: false, message: err instanceof HTTPException ? err.message : '处理失败' });
    }
  }
  return results;
}

export async function batchWithdrawInstances(instanceIds: number[], _comment?: string): Promise<import('@zenith/shared').WorkflowInstanceBatchActionResult[]> {
  const results: import('@zenith/shared').WorkflowInstanceBatchActionResult[] = [];
  for (const instanceId of instanceIds) {
    try {
      await withdrawInstance(instanceId);
      results.push({ instanceId, success: true });
    } catch (err) {
      results.push({ instanceId, success: false, message: err instanceof HTTPException ? err.message : '撤回失败' });
    }
  }
  return results;
}

export async function batchUrgeInstances(instanceIds: number[], message?: string): Promise<import('@zenith/shared').WorkflowInstanceBatchActionResult[]> {
  const results: import('@zenith/shared').WorkflowInstanceBatchActionResult[] = [];
  for (const instanceId of instanceIds) {
    try {
      const r = await urgeInstance(instanceId, message);
      results.push({ instanceId, success: true, message: r.message });
    } catch (err) {
      results.push({ instanceId, success: false, message: err instanceof HTTPException ? err.message : '催办失败' });
    }
  }
  return results;
}
