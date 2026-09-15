import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../db';
import { users, userRoles, type WorkflowDefinitionRow } from '../../db/schema';
import { currentUser } from '../../lib/context';

/** 发起与预览共用发起范围，预览不意味着可以越过实际提交权限。 */
export async function assertWorkflowInitiatorScope(def: Pick<WorkflowDefinitionRow, 'initiatorScopeType' | 'initiatorScopeIds'>, user: Pick<ReturnType<typeof currentUser>, 'userId'> = currentUser()) {
  const scopeType = (def.initiatorScopeType ?? 'all') as 'all' | 'users' | 'departments' | 'roles';
  const scopeIds = Array.isArray(def.initiatorScopeIds)
    ? def.initiatorScopeIds.map(Number).filter((v) => Number.isInteger(v) && v > 0)
    : [];
  if (scopeType !== 'all') {
    let allowed = false;
    if (scopeType === 'users') {
      allowed = scopeIds.includes(user.userId);
    } else if (scopeType === 'departments') {
      const [me] = await db.select({ departmentId: users.departmentId }).from(users).where(eq(users.id, user.userId)).limit(1);
      allowed = me?.departmentId != null && scopeIds.includes(me.departmentId);
    } else if (scopeType === 'roles') {
      const roleRows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, user.userId));
      allowed = roleRows.some((r) => scopeIds.includes(r.roleId));
    }
    if (!allowed) {
      throw new HTTPException(403, { message: '当前流程不在你的可发起范围内' });
    }
  }
}
