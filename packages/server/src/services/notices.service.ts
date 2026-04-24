import { eq, inArray, sql, or } from 'drizzle-orm';
import { db } from '../db';
import type { DbExecutor } from '../db/types';
import { notices, noticeRecipients, users, userRoles } from '../db/schema';
import { broadcast, sendToUser } from '../lib/ws-manager';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapNotice(row: typeof notices.$inferSelect) {
  return {
    ...row,
    targetType: row.targetType as 'all' | 'specific',
    publishTime: row.publishTime ? row.publishTime.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── 访问过滤条件（只能看到自己有权限的通知）────────────────────────────────

export function buildAccessFilter(userId: number) {
  return or(
    eq(notices.targetType, 'all'),
    sql`EXISTS (
      SELECT 1 FROM notice_recipients nr
      WHERE nr.notice_id = ${notices.id}
      AND (
        (nr.recipient_type = 'user' AND nr.recipient_id = ${userId})
        OR (nr.recipient_type = 'role' AND nr.recipient_id IN (
          SELECT role_id FROM user_roles WHERE user_id = ${userId}
        ))
        OR (nr.recipient_type = 'dept' AND nr.recipient_id = (
          SELECT department_id FROM users WHERE id = ${userId}
        ))
      )
    )`,
  );
}

// ─── 收件人管理 ───────────────────────────────────────────────────────────────

export async function saveRecipients(
  executor: DbExecutor,
  noticeId: number,
  recipientList: Array<{ recipientType: string; recipientId: number }>,
) {
  await executor.delete(noticeRecipients).where(eq(noticeRecipients.noticeId, noticeId));
  if (recipientList.length > 0) {
    await executor
      .insert(noticeRecipients)
      .values(recipientList.map((r) => ({ noticeId, recipientType: r.recipientType, recipientId: r.recipientId })))
      .onConflictDoNothing();
  }
}

// ─── WebSocket 广播 ───────────────────────────────────────────────────────────

export async function broadcastNotice(notice: ReturnType<typeof mapNotice>, noticeId: number) {
  if (notice.targetType === 'all') {
    broadcast({ type: 'notice:new', payload: notice });
    return;
  }
  const recipientRows = await db.select().from(noticeRecipients).where(eq(noticeRecipients.noticeId, noticeId));
  const userIdSet = new Set<number>();
  recipientRows.filter((r) => r.recipientType === 'user').forEach((r) => userIdSet.add(r.recipientId));
  const roleIds = recipientRows.filter((r) => r.recipientType === 'role').map((r) => r.recipientId);
  if (roleIds.length > 0) {
    const roleUsers = await db.select({ userId: userRoles.userId }).from(userRoles).where(inArray(userRoles.roleId, roleIds));
    roleUsers.forEach((r) => userIdSet.add(r.userId));
  }
  const deptIds = recipientRows.filter((r) => r.recipientType === 'dept').map((r) => r.recipientId);
  if (deptIds.length > 0) {
    const deptUsers = await db.select({ id: users.id }).from(users).where(inArray(users.departmentId, deptIds));
    deptUsers.forEach((u) => userIdSet.add(u.id));
  }
  for (const uid of userIdSet) sendToUser(uid, { type: 'notice:new', payload: notice });
}
