// ─── 数据映射 ─────────────────────────────────────────────────────────────────
import { formatDateTime, formatNullableDateTime } from '../lib/datetime';

export function mapTask(
  row: typeof workflowTasks.$inferSelect,
  assigneeName?: string | null,
  assigneeAvatar?: string | null,
) {
  return {
    id: row.id,
    instanceId: row.instanceId,
    nodeKey: row.nodeKey,
    nodeName: row.nodeName,
    nodeType: row.nodeType ?? null,
    assigneeId: row.assigneeId,
    assigneeName: assigneeName ?? null,
    assigneeAvatar: assigneeAvatar ?? null,
    status: row.status,
    comment: row.comment,
    actionAt: formatNullableDateTime(row.actionAt),
    createdAt: formatDateTime(row.createdAt),
  };
}

export function mapInstance(
  row: typeof workflowInstances.$inferSelect,
  extras: {
    definitionName?: string | null;
    initiatorName?: string | null;
    initiatorAvatar?: string | null;
    tasks?: ReturnType<typeof mapTask>[];
  } = {},
) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    definitionName: extras.definitionName ?? null,
    title: row.title,
    formData: row.formData,
    status: row.status,
    currentNodeKey: row.currentNodeKey,
    initiatorId: row.initiatorId,
    initiatorName: extras.initiatorName ?? null,
    initiatorAvatar: extras.initiatorAvatar ?? null,
    tenantId: row.tenantId,
    tasks: extras.tasks ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

// ─── 业务逻辑 ─────────────────────────────────────────────────────────────────
import { count, countDistinct, eq, and, desc, ilike, or } from 'drizzle-orm';
import { escapeLike, withPagination } from '../lib/where-helpers';
import { db } from '../db';
import { pageOffset } from '../lib/pagination';
import { workflowInstances, workflowTasks, workflowDefinitions, users } from '../db/schema';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { advanceFlow, getInitialTasks, validateFlowData } from '../lib/workflow-engine';
import type { WorkflowFlowData } from '@zenith/shared';
import { HTTPException } from 'hono/http-exception';
import { currentUser } from '../lib/context';

type InstanceStatus = 'draft' | 'running' | 'approved' | 'rejected' | 'withdrawn';

export async function listMyInstances(query: { page?: number; pageSize?: number; status?: string }) {
  const user = currentUser();
  const { page = 1, pageSize = 20, status } = query;
  const tc = tenantCondition(workflowInstances, user);
  const conditions = [eq(workflowInstances.initiatorId, user.userId)];
  if (tc) conditions.push(tc);
  if (status) conditions.push(eq(workflowInstances.status, status as InstanceStatus));
  const where = and(...conditions);
  const [total, rows] = await Promise.all([
    db.$count(workflowInstances, where),
    db.query.workflowInstances.findMany({
      where,
      with: {
        definition: { columns: { name: true } },
        initiator: { columns: { nickname: true, avatar: true } },
      },
      orderBy: desc(workflowInstances.id),
      limit: pageSize,
      offset: pageOffset(page, pageSize),
    }),
  ]);
  return {
    list: rows.map((r) => mapInstance(r, {
      definitionName: r.definition?.name ?? null,
      initiatorName: r.initiator?.nickname ?? null,
      initiatorAvatar: r.initiator?.avatar ?? null,
    })),
    total, page, pageSize,
  };
}

export async function listPendingMine(query: { page?: number; pageSize?: number }) {
  const user = currentUser();
  const { page = 1, pageSize = 20 } = query;
  const tc = tenantCondition(workflowInstances, user);
  const where = and(
    eq(workflowTasks.assigneeId, user.userId),
    eq(workflowTasks.status, 'pending'),
    eq(workflowInstances.status, 'running'),
    tc,
  );
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: countDistinct(workflowInstances.id) })
      .from(workflowTasks)
      .innerJoin(workflowInstances, eq(workflowTasks.instanceId, workflowInstances.id))
      .where(where),
    withPagination(
      db
        .select({ inst: workflowInstances, definitionName: workflowDefinitions.name, initiatorName: users.nickname, initiatorAvatar: users.avatar, task: workflowTasks })
        .from(workflowTasks)
        .innerJoin(workflowInstances, eq(workflowTasks.instanceId, workflowInstances.id))
        .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
        .leftJoin(users, eq(workflowInstances.initiatorId, users.id))
        .where(where)
        .orderBy(desc(workflowTasks.createdAt))
        .$dynamic(),
      page, pageSize,
    ),
  ]);
  return {
    list: rows.map((r) => ({ ...mapInstance(r.inst, r), pendingTaskId: r.task.id })),
    total: Number(total),
    page,
    pageSize,
  };
}

export async function listAllInstances(query: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
  const user = currentUser();
  const { page = 1, pageSize = 20, status, keyword } = query;
  const conditions = [];
  const tc = tenantCondition(workflowInstances, user);
  if (tc) conditions.push(tc);
  if (status) conditions.push(eq(workflowInstances.status, status as InstanceStatus));
  if (keyword) {
    const likeValue = `%${escapeLike(keyword)}%`;
    conditions.push(or(ilike(workflowInstances.title, likeValue), ilike(workflowDefinitions.name, likeValue)));
  }
  const where = and(...conditions);
  const [statRows, [{ total }], rows] = await Promise.all([
    db.select({ status: workflowInstances.status, cnt: count() })
      .from(workflowInstances)
      .where(tc)
      .groupBy(workflowInstances.status),
    db.select({ total: count() })
      .from(workflowInstances)
      .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
      .where(where),
    withPagination(
      db.select({ inst: workflowInstances, definitionName: workflowDefinitions.name, initiatorName: users.nickname, initiatorAvatar: users.avatar })
        .from(workflowInstances)
        .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
        .leftJoin(users, eq(workflowInstances.initiatorId, users.id))
        .where(where)
        .orderBy(desc(workflowInstances.id))
        .$dynamic(),
      page, pageSize,
    ),
  ]);
  const stats: Record<string, number> = { total: 0, running: 0, approved: 0, rejected: 0, withdrawn: 0 };
  for (const r of statRows) {
    stats[r.status] = r.cnt;
    stats.total += r.cnt;
  }
  return { stats, list: rows.map((r) => mapInstance(r.inst, r)), total, page, pageSize };
}

export async function getInstanceDetail(id: number) {
  const user = currentUser();
  const tc = tenantCondition(workflowInstances, user);
  const conditions = [eq(workflowInstances.id, id)];
  if (tc) conditions.push(tc);
  const row = await db.query.workflowInstances.findFirst({
    where: and(...conditions),
    with: {
      definition: { columns: { name: true } },
      initiator: { columns: { nickname: true, avatar: true } },
      tasks: {
        with: { assignee: { columns: { nickname: true, avatar: true } } },
        orderBy: workflowTasks.id,
      },
    },
  });
  if (!row) throw new HTTPException(404, { message: '流程实例不存在' });
  const isInitiator = row.initiatorId === user.userId;
  const isAssignee = row.tasks.some((t) => t.assigneeId === user.userId);
  if (!isInitiator && !isAssignee) throw new HTTPException(403, { message: '无权查看' });
  const tasks = row.tasks.map((t) => mapTask(t, t.assignee?.nickname, t.assignee?.avatar));
  return mapInstance(row, {
    definitionName: row.definition?.name ?? null,
    initiatorName: row.initiator?.nickname ?? null,
    initiatorAvatar: row.initiator?.avatar ?? null,
    tasks,
  });
}

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

export async function createInstance(data: { definitionId: number; title: string; formData?: Record<string, unknown> | null }) {
  const user = currentUser();
  const [def] = await db.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.id, data.definitionId), eq(workflowDefinitions.status, 'published'))).limit(1);
  if (!def) throw new HTTPException(404, { message: '流程定义不存在或未发布' });
  const flowData = def.flowData as WorkflowFlowData;
  if (!flowData?.nodes?.length) throw new HTTPException(400, { message: '流程定义无效' });
  const validation = validateFlowData(flowData);
  if (!validation.valid) throw new HTTPException(400, { message: validation.errors[0] });
  const formData: Record<string, unknown> = data.formData ?? {};
  const initialResult = getInitialTasks(flowData, formData);
  if (initialResult.tasksToCreate.length === 0 && !initialResult.finished) {
    throw new HTTPException(400, { message: '流程定义中无可执行节点' });
  }
  const instance = await db.transaction(async (tx) => {
    const [createdInstance] = await tx.insert(workflowInstances).values({
      definitionId: def.id,
      definitionSnapshot: def as unknown as Record<string, unknown>,
      title: data.title,
      formData,
      status: initialResult.finished ? 'approved' : 'running',
      currentNodeKey: initialResult.currentNodeKeys[0] ?? null,
      initiatorId: user.userId,
      tenantId: getCreateTenantId(user),
    }).returning();
    if (initialResult.tasksToCreate.length > 0) {
      await tx.insert(workflowTasks).values(
        initialResult.tasksToCreate.map((t) => ({
          instanceId: createdInstance.id,
          nodeKey: t.nodeKey,
          nodeName: t.nodeName,
          nodeType: t.nodeType,
          assigneeId: t.assigneeId,
          status: t.nodeType === 'ccNode' ? 'skipped' as const : 'pending' as const,
        })),
      );
    }
    return createdInstance;
  });
  return mapInstance(instance);
}

export async function withdrawInstance(id: number) {
  const user = currentUser();
  const tc = tenantCondition(workflowInstances, user);
  const conditions = [eq(workflowInstances.id, id)];
  if (tc) conditions.push(tc);
  const [inst] = await db.select().from(workflowInstances).where(and(...conditions)).limit(1);
  if (!inst) throw new HTTPException(404, { message: '流程实例不存在' });
  if (inst.initiatorId !== user.userId) throw new HTTPException(403, { message: '只有发起人可以撤回' });
  if (inst.status !== 'running') throw new HTTPException(400, { message: '只能撤回进行中的申请' });
  const updated = await db.transaction(async (tx) => {
    await tx.update(workflowTasks).set({ status: 'skipped', actionAt: new Date() })
      .where(and(eq(workflowTasks.instanceId, id), eq(workflowTasks.status, 'pending')));
    const [row] = await tx.update(workflowInstances).set({ status: 'withdrawn' }).where(and(...conditions)).returning();
    return row;
  });
  return mapInstance(updated);
}

export interface ApproveResult {
  instance: ReturnType<typeof mapInstance>;
  message: string;
}

export async function approveTask(taskId: number, comment?: string): Promise<ApproveResult> {
  const user = currentUser();
  const [task] = await db.select().from(workflowTasks).where(and(eq(workflowTasks.id, taskId), eq(workflowTasks.assigneeId, user.userId))).limit(1);
  if (!task) throw new HTTPException(404, { message: '任务不存在或无权操作' });
  if (task.status !== 'pending') throw new HTTPException(400, { message: '任务已处理' });
  const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, task.instanceId)).limit(1);
  if (!inst) throw new HTTPException(500, { message: '流程数据异常' });
  if (inst.status !== 'running') throw new HTTPException(400, { message: '流程实例不在进行中' });

  const snapshot = inst.definitionSnapshot as { flowData?: WorkflowFlowData };
  const flowData = snapshot?.flowData;
  if (!flowData) throw new HTTPException(500, { message: '流程快照数据异常' });

  const updated = await db.transaction(async (tx) => {
    await tx.update(workflowTasks).set({
      status: 'approved',
      comment: comment ?? null,
      actionAt: new Date(),
    }).where(eq(workflowTasks.id, taskId));

    const allTasks = await tx.select().from(workflowTasks).where(and(eq(workflowTasks.instanceId, inst.id), eq(workflowTasks.status, 'approved')));
    const completedKeys = new Set(allTasks.map((t) => t.nodeKey));
    completedKeys.add('start');
    const formData = (inst.formData ?? {}) as Record<string, unknown>;
    const advanceResult = advanceFlow(flowData, task.nodeKey, formData, completedKeys);

    if (advanceResult.finished && advanceResult.tasksToCreate.length === 0) {
      const [row] = await tx.update(workflowInstances).set({ status: 'approved', currentNodeKey: null }).where(eq(workflowInstances.id, inst.id)).returning();
      return { row, finished: true };
    }

    if (advanceResult.tasksToCreate.length > 0) {
      await tx.insert(workflowTasks).values(
        advanceResult.tasksToCreate.map((t) => ({
          instanceId: inst.id,
          nodeKey: t.nodeKey,
          nodeName: t.nodeName,
          nodeType: t.nodeType,
          assigneeId: t.assigneeId,
          status: t.nodeType === 'ccNode' ? 'skipped' as const : 'pending' as const,
        })),
      );
    }

    if (advanceResult.finished) {
      const [row] = await tx.update(workflowInstances).set({ status: 'approved', currentNodeKey: null }).where(eq(workflowInstances.id, inst.id)).returning();
      return { row, finished: true };
    }

    const [row] = await tx.update(workflowInstances)
      .set({ currentNodeKey: advanceResult.currentNodeKeys[0] ?? null })
      .where(eq(workflowInstances.id, inst.id))
      .returning();
    return { row, finished: false };
  });

  return {
    instance: mapInstance(updated.row),
    message: updated.finished ? '审批通过，流程已完成' : '审批通过，流程已推进',
  };
}

export async function rejectTask(taskId: number, comment: string) {
  const user = currentUser();
  const [task] = await db.select().from(workflowTasks).where(and(eq(workflowTasks.id, taskId), eq(workflowTasks.assigneeId, user.userId))).limit(1);
  if (!task) throw new HTTPException(404, { message: '任务不存在或无权操作' });
  if (task.status !== 'pending') throw new HTTPException(400, { message: '任务已处理' });
  const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, task.instanceId)).limit(1);
  if (!inst) throw new HTTPException(500, { message: '流程数据异常' });
  if (inst.status !== 'running') throw new HTTPException(400, { message: '流程实例不在进行中' });
  const updated = await db.transaction(async (tx) => {
    await tx.update(workflowTasks)
      .set({ status: 'rejected', comment, actionAt: new Date() })
      .where(eq(workflowTasks.id, taskId));
    const [row] = await tx.update(workflowInstances)
      .set({ status: 'rejected', currentNodeKey: null })
      .where(eq(workflowInstances.id, inst.id))
      .returning();
    return row;
  });
  return mapInstance(updated);
}
