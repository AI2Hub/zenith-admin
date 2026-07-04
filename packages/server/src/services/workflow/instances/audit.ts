// ─── 审计前置数据读取（拆分自 workflow-instances.service.ts）───
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db';
import { workflowInstances, workflowTasks } from '../../../db/schema';
import { tenantCondition } from '../../../lib/tenant';
import { currentUser } from '../../../lib/context';
import { mapInstance } from './mapping';
import { getInstanceDetail } from './queries';

export async function getWorkflowInstanceBeforeAudit(id: number) {
  try {
    return await getInstanceDetail(id);
  } catch {
    return null;
  }
}

export async function getWorkflowTaskBeforeAudit(taskId: number) {
  const user = currentUser();
  const [task] = await db
    .select({ instanceId: workflowTasks.instanceId })
    .from(workflowTasks)
    .where(and(eq(workflowTasks.id, taskId), eq(workflowTasks.assigneeId, user.userId)))
    .limit(1);
  if (!task) return null;
  return getWorkflowInstanceBeforeAudit(task.instanceId);
}

export async function getWorkflowTaskForAdminAudit(taskId: number) {
  const [task] = await db
    .select({ instanceId: workflowTasks.instanceId })
    .from(workflowTasks)
    .where(eq(workflowTasks.id, taskId))
    .limit(1);
  if (!task) return null;
  return getInstanceForAdminAudit(task.instanceId);
}

/** 监控页管理员操作的审计前置快照（不做发起人/审批人权限校验） */
export async function getInstanceForAdminAudit(id: number) {
  const user = currentUser();
  const tc = tenantCondition(workflowInstances, user);
  const conditions = [eq(workflowInstances.id, id)];
  if (tc) conditions.push(tc);
  const [inst] = await db.select().from(workflowInstances).where(and(...conditions)).limit(1);
  return inst ? mapInstance(inst) : null;
}
