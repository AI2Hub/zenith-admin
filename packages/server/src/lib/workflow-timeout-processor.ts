import { and, eq, lte, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import { workflowTasks, workflowInstances } from '../db/schema';
import { approveTaskCore, rejectTaskCore, systemTransferTaskToManager } from '../services/workflow-instances.service';
import { resolveUserManagerId } from '../services/workflow-assignee-resolver.service';
import { computeTimeoutAt } from './workflow-timeout';
import type { WorkflowFlowData, WorkflowNodeConfig } from '@zenith/shared';
import logger from './logger';

const SYSTEM_ACTOR = { userId: 0, name: 'system:timeout' } as const;

/**
 * 扫描所有已超时的 pending 审批任务并执行相应动作。
 * 由 cron 调度器周期性触发（建议每 1-5 分钟）。
 */
export async function processWorkflowTaskTimeouts(): Promise<{ processed: number; reminded: number; approved: number; rejected: number; escalated: number }> {
  const now = new Date();
  const due = await db.select()
    .from(workflowTasks)
    .where(and(eq(workflowTasks.status, 'pending'), isNotNull(workflowTasks.timeoutAt), lte(workflowTasks.timeoutAt, now)));

  if (due.length === 0) return { processed: 0, reminded: 0, approved: 0, rejected: 0, escalated: 0 };

  // 按 instanceId 聚合，避免重复加载实例快照
  const instanceIds = [...new Set(due.map((t) => t.instanceId))];
  const insts = await db.select().from(workflowInstances).where(inArray(workflowInstances.id, instanceIds));
  const instMap = new Map(insts.map((i) => [i.id, i] as const));

  let reminded = 0;
  let approved = 0;
  let rejected = 0;
  let escalated = 0;

  for (const task of due) {
    const inst = instMap.get(task.instanceId);
    if (!inst || inst.status !== 'running') continue;
    const snapshot = inst.definitionSnapshot as { flowData?: WorkflowFlowData } | null;
    const flowData = snapshot?.flowData;
    const nodeCfg: WorkflowNodeConfig | undefined = flowData?.nodes.find((n) => n.data.key === task.nodeKey)?.data;
    const cfg = nodeCfg?.timeout;
    if (!cfg || !cfg.enabled) {
      // 配置已被移除：清空 timeoutAt 防止重复扫描
      await db.update(workflowTasks).set({ timeoutAt: null }).where(eq(workflowTasks.id, task.id));
      continue;
    }

    try {
      if (cfg.action === 'autoApprove') {
        await approveTaskCore(task, inst, '系统超时自动通过', SYSTEM_ACTOR);
        approved += 1;
      } else if (cfg.action === 'autoReject') {
        await rejectTaskCore(task, inst, '系统超时自动拒绝', SYSTEM_ACTOR);
        rejected += 1;
      } else {
        // action='remind'：累加提醒次数；耗尽后按 escalateAction 升级处理
        const nextCount = (task.timeoutRemindCount ?? 0) + 1;
        const maxRemind = cfg.remindCount ?? 3;
        const reachedMax = nextCount >= maxRemind;
        if (!reachedMax) {
          await db.update(workflowTasks)
            .set({ timeoutRemindCount: nextCount, timeoutAt: computeTimeoutAt(cfg, now) })
            .where(eq(workflowTasks.id, task.id));
          logger.info('workflow task timeout remind', { taskId: task.id, instanceId: inst.id, nextCount, maxRemind });
          reminded += 1;
          continue;
        }

        // 提醒已耗尽 → 升级
        const escalate = cfg.escalateAction ?? 'none';
        if (escalate === 'autoApprove') {
          await db.update(workflowTasks).set({ timeoutRemindCount: nextCount, timeoutAt: null }).where(eq(workflowTasks.id, task.id));
          await approveTaskCore(task, inst, '系统超时（提醒耗尽）自动通过', SYSTEM_ACTOR);
          approved += 1;
        } else if (escalate === 'autoReject') {
          await db.update(workflowTasks).set({ timeoutRemindCount: nextCount, timeoutAt: null }).where(eq(workflowTasks.id, task.id));
          await rejectTaskCore(task, inst, '系统超时（提醒耗尽）自动拒绝', SYSTEM_ACTOR);
          rejected += 1;
        } else if (escalate === 'transferToManager') {
          const managerId = task.assigneeId
            ? await resolveUserManagerId(task.assigneeId, cfg.escalateManagerLevel ?? 1)
            : null;
          if (managerId && managerId !== task.assigneeId) {
            await systemTransferTaskToManager(task, inst, managerId, computeTimeoutAt(cfg, now), '[系统超时] 提醒耗尽，自动转交给上级处理');
            logger.info('workflow task timeout escalate transfer', { taskId: task.id, instanceId: inst.id, managerId });
            escalated += 1;
          } else {
            // 无上级可转：停止扫描，保持挂起
            await db.update(workflowTasks).set({ timeoutRemindCount: nextCount, timeoutAt: null }).where(eq(workflowTasks.id, task.id));
            logger.warn('workflow task timeout escalate: no manager', { taskId: task.id, instanceId: inst.id, assigneeId: task.assigneeId });
          }
        } else {
          // none：停止扫描，保持挂起
          await db.update(workflowTasks).set({ timeoutRemindCount: nextCount, timeoutAt: null }).where(eq(workflowTasks.id, task.id));
        }
      }
    } catch (err) {
      logger.error('processWorkflowTaskTimeouts: action failed', { err, taskId: task.id });
    }
  }

  return { processed: due.length, reminded, approved, rejected, escalated };
}
