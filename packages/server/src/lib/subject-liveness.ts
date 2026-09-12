import { eq } from 'drizzle-orm';
import { db } from '../db';
import type { DbExecutor } from '../db/types';
import { tenants, users } from '../db/schema';
import { isTenantActive } from './tenant';

/**
 * 主体权威行：`users ⟕ tenants`。JWT 鉴权（每请求）、refresh 续签、OAuth 授权 / userinfo 都从这一列集判定
 * 「这个用户现在还能不能用」；列集取三者之并，多出的几列对 5s 进程内副本可忽略。
 * 类型直接从 select 列集推导，列的可空性跟随 schema，不会与手写接口漂移。
 */
const subjectColumns = {
  id: users.id,
  username: users.username,
  nickname: users.nickname,
  email: users.email,
  avatar: users.avatar,
  status: users.status,
  tenantId: users.tenantId,
  tenantStatus: tenants.status,
  tenantExpireAt: tenants.expireAt,
};

export type SubjectRow = NonNullable<Awaited<ReturnType<typeof loadSubjectRow>>>;

export async function loadSubjectRow(userId: number, executor: DbExecutor = db) {
  const [row] = await executor.select(subjectColumns)
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export type SubjectLivenessVerdict =
  | { ok: true; row: SubjectRow; tenantId: number | null }
  | { ok: false; status: 401 | 403; message: string };

export interface SubjectLivenessOptions {
  /**
   * 令牌里声明的租户（`payload.tenantId ?? null`）：与库中所属租户不一致即视为登录状态失效
   * （用户被移入 / 移出租户后旧令牌必须作废）。不传则不校验声明（OAuth 用户没有令牌租户声明）。
   */
  claimedTenantId?: number | null;
  now?: Date;
}

/**
 * 主体活性判定，鉴权 / 续签 / OAuth 三条链路必须同口径：
 * 用户存在 → 账号 enabled → 令牌租户声明与库一致 → 所属租户未禁用 / 未到期。
 * 只产出判定，不决定副作用：中间件直接返回、续签先吊销旧会话再抛 HTTPException、OAuth 视为不可用。
 */
export function checkSubjectLiveness(row: SubjectRow | null, options: SubjectLivenessOptions = {}): SubjectLivenessVerdict {
  if (!row) return { ok: false, status: 401, message: '用户不存在' };
  if (row.status !== 'enabled') return { ok: false, status: 403, message: '账号已被禁用' };
  const tenantId = row.tenantId ?? null;
  if ('claimedTenantId' in options && (options.claimedTenantId ?? null) !== tenantId) {
    return { ok: false, status: 401, message: '登录状态已失效，请重新登录' };
  }
  if (tenantId !== null && !isTenantActive({ status: row.tenantStatus, expireAt: row.tenantExpireAt }, options.now)) {
    return { ok: false, status: 403, message: '租户已被禁用或过期' };
  }
  return { ok: true, row, tenantId };
}
