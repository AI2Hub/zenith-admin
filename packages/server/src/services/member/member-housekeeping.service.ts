/**
 * 会员数据例行维护（系统周期任务 member-housekeeping 调用）。
 *
 * - expireMemberCoupons()：将已过 expireAt 的未使用券批量置为 expired，修正统计口径
 * - expireInactivePoints()：按 system_config `member_point_expire_days`（0=关闭）
 *   清零长期无积分变动账户的余额，走 changePoints(type='expire') 记流水，可审计可对账
 * - cleanupMemberLoginLogs()：按 system_config `member_login_log_retention_days`（0=不清理）
 *   删除超期登录日志，防止无限增长
 */
import { and, eq, gt, isNull, lt, lte } from 'drizzle-orm';
import { db } from '../../db';
import { memberCoupons, memberLoginLogs, memberPointAccounts, members } from '../../db/schema';
import { getConfigNumber } from '../../lib/system-config';
import logger from '../../lib/logger';
import { changePoints } from './member-points.service';

/** 未使用且已过实际过期时间的券批量置为 expired，返回处理数量 */
export async function expireMemberCoupons(): Promise<number> {
  const now = new Date();
  const updated = await db
    .update(memberCoupons)
    .set({ status: 'expired' })
    .where(and(eq(memberCoupons.status, 'unused'), lt(memberCoupons.expireAt, now)))
    .returning({ id: memberCoupons.id });
  return updated.length;
}

/**
 * 积分不活跃过期：清零「余额 > 0 且超过 N 天无任何积分变动」账户的全部余额。
 * 以 member_point_accounts.updatedAt 为最后变动时间（任何记账都会刷新）。
 * 逐账户走 changePoints 统一记账（乐观锁 + expire 流水），单账户失败不影响其余账户。
 */
export async function expireInactivePoints(): Promise<{ expired: number; skipped: number }> {
  const days = await getConfigNumber('member_point_expire_days', 0);
  if (days <= 0) return { expired: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ memberId: memberPointAccounts.memberId, balance: memberPointAccounts.balance })
    .from(memberPointAccounts)
    .innerJoin(members, eq(members.id, memberPointAccounts.memberId))
    .where(and(
      gt(memberPointAccounts.balance, 0),
      lte(memberPointAccounts.updatedAt, cutoff),
      isNull(members.deletedAt),
    ));

  let expired = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await changePoints({
        memberId: row.memberId,
        type: 'expire',
        amount: -row.balance,
        bizType: 'points_inactive_expire',
        remark: `超过 ${days} 天无积分变动，余额自动过期`,
      });
      expired += 1;
    } catch (err) {
      // 窗口期内发生并发变动（余额变化/乐观锁重试耗尽）则跳过，下个周期重新评估
      skipped += 1;
      logger.warn(`[MemberHousekeeping] 积分过期跳过 memberId=${row.memberId}: ${(err as Error).message}`);
    }
  }
  return { expired, skipped };
}

/** 删除超过保留期的会员登录日志，返回删除数量 */
export async function cleanupMemberLoginLogs(): Promise<number> {
  const days = await getConfigNumber('member_login_log_retention_days', 180);
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // 每日增量清理，returning 行数可控
  const deleted = await db.delete(memberLoginLogs)
    .where(lt(memberLoginLogs.createdAt, cutoff))
    .returning({ id: memberLoginLogs.id });
  return deleted.length;
}

/** 每日例行维护入口（券过期 → 积分不活跃过期 → 登录日志清理）*/
export async function runMemberHousekeeping(): Promise<string> {
  const coupons = await expireMemberCoupons();
  const points = await expireInactivePoints();
  const logs = await cleanupMemberLoginLogs();
  return `券过期 ${coupons} 张；积分过期 ${points.expired} 户（跳过 ${points.skipped}）；清理登录日志 ${logs} 条`;
}
