import { and, eq, desc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { workflowCompensations, workflowInstances, workflowTasks, workflowTokens } from '../db/schema';
import type { DbExecutor } from '../db/types';
import { currentUser } from '../lib/context';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { formatDateTime, formatNullableDateTime } from '../lib/datetime';

type Row = typeof workflowCompensations.$inferSelect;
const map = (r: Row) => ({
  id: r.id, instanceId: r.instanceId, nodeKey: r.nodeKey, nodeName: r.nodeName ?? null,
  errorMessage: r.errorMessage ?? null, action: r.action, status: r.status as 'pending' | 'resolved' | 'terminated',
  resolution: r.resolution ?? null, resolvedBy: r.resolvedBy ?? null, resolvedAt: formatNullableDateTime(r.resolvedAt), createdAt: formatDateTime(r.createdAt),
});

/** catch 触发时记录补偿工单（toAdmin=pending 待人工修复；notify/terminate=已闭环存档） */
export async function recordCompensation(tx: DbExecutor, v: { instanceId: number; nodeKey: string; nodeName?: string; errorMessage?: string; action: string; status: 'pending' | 'resolved' | 'terminated'; tenantId: number | null }): Promise<void> {
  await tx.insert(workflowCompensations).values({
    instanceId: v.instanceId, nodeKey: v.nodeKey, nodeName: v.nodeName ?? null, errorMessage: v.errorMessage?.slice(0, 1000) ?? null,
    action: v.action, status: v.status, tenantId: v.tenantId,
  });
}

export async function listCompensations(q: { status?: string; instanceId?: number; page?: number; pageSize?: number }) {
  const page = q.page ?? 1, pageSize = q.pageSize ?? 20;
  const tc = tenantCondition(workflowCompensations, currentUser());
  const conds = [];
  if (tc) conds.push(tc);
  if (q.status) conds.push(eq(workflowCompensations.status, q.status));
  if (q.instanceId) conds.push(eq(workflowCompensations.instanceId, q.instanceId));
  const where = conds.length ? and(...conds) : undefined;
  const [total, rows] = await Promise.all([
    db.$count(workflowCompensations, where),
    db.select().from(workflowCompensations).where(where).orderBy(desc(workflowCompensations.id)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  return { list: rows.map(map), total, page, pageSize };
}

/** 人工修复：resolve=补偿完成放行（保留实例），terminate=终止实例并取消待办 */
export async function resolveCompensation(id: number, action: 'resolve' | 'terminate', resolution?: string) {
  const tc = tenantCondition(workflowCompensations, currentUser());
  const conds = [eq(workflowCompensations.id, id)];
  if (tc) conds.push(tc);
  const [row] = await db.select().from(workflowCompensations).where(and(...conds)).limit(1);
  if (!row) throw new HTTPException(404, { message: '补偿工单不存在' });
  if (row.status !== 'pending') throw new HTTPException(400, { message: '工单已处理' });
  return db.transaction(async (tx) => {
    if (action === 'terminate') {
      await tx.update(workflowTasks).set({ status: 'skipped', actionAt: new Date() }).where(and(eq(workflowTasks.instanceId, row.instanceId), eq(workflowTasks.status, 'pending')));
      await tx.update(workflowTokens).set({ status: 'consumed', consumedAt: new Date() }).where(and(eq(workflowTokens.instanceId, row.instanceId), eq(workflowTokens.status, 'active')));
      await tx.update(workflowInstances).set({ status: 'rejected', currentNodeKey: null }).where(eq(workflowInstances.id, row.instanceId));
    }
    const [updated] = await tx.update(workflowCompensations)
      .set({ status: action === 'terminate' ? 'terminated' : 'resolved', resolution: resolution ?? null, resolvedBy: currentUser()?.userId ?? null, resolvedAt: new Date() })
      .where(eq(workflowCompensations.id, id)).returning();
    return map(updated);
  });
}
