/**
 * 会员数据看板统计服务（只读聚合）。
 * 概览卡片 + 图表（注册趋势 / 等级分布 / 积分收支 / 签到人数）。
 */
import { count, sql, and, gte, lt, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  members, memberLevels, memberPointAccounts, memberWallets,
  memberPointTransactions, memberCheckins, memberCoupons,
} from '../../db/schema';
import { formatDate } from '../../lib/datetime';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function buildDateAxis(start: Date, days: number): string[] {
  const axis: string[] = [];
  for (let i = 0; i < days; i++) axis.push(formatDate(shiftDays(start, i)));
  return axis;
}

export async function getMemberStats() {
  const todayStart = startOfToday();
  const todayEnd = shiftDays(todayStart, 1);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const days30Ago = shiftDays(todayStart, -29);
  const todayStr = formatDate(todayStart);

  const [
    totalMembers, todayNewMembers, monthNewMembers, activeMembers30d,
    pointSumRow, walletSumRow, todayCheckins, availableCoupons,
  ] = await Promise.all([
    db.$count(members),
    db.$count(members, and(gte(members.createdAt, todayStart), lt(members.createdAt, todayEnd))),
    db.$count(members, gte(members.createdAt, monthStart)),
    db.$count(members, gte(members.lastLoginAt, days30Ago)),
    db.select({ v: sql<number>`coalesce(sum(${memberPointAccounts.balance}), 0)::int` }).from(memberPointAccounts),
    db.select({ v: sql<number>`coalesce(sum(${memberWallets.balance}), 0)::int` }).from(memberWallets),
    db.$count(memberCheckins, eq(memberCheckins.checkinDate, todayStr)),
    db.$count(memberCoupons, eq(memberCoupons.status, 'unused')),
  ]);

  const totalPoints = pointSumRow[0]?.v ?? 0;
  const totalWalletBalance = walletSumRow[0]?.v ?? 0;
  const todayCheckinRate = totalMembers > 0 ? Math.round((todayCheckins / totalMembers) * 1000) / 10 : 0;

  return {
    totalMembers,
    todayNewMembers,
    monthNewMembers,
    activeMembers30d,
    totalPoints,
    totalWalletBalance,
    todayCheckins,
    todayCheckinRate,
    availableCoupons,
  };
}

export async function getMemberCharts() {
  const todayStart = startOfToday();
  const days30Ago = shiftDays(todayStart, -29);
  const days7Ago = shiftDays(todayStart, -6);

  const [registerRows, levelRows, pointRows, checkinRows] = await Promise.all([
    db.select({
      date: sql<string>`to_char(date(${members.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    })
      .from(members)
      .where(gte(members.createdAt, days30Ago))
      .groupBy(sql`date(${members.createdAt})`)
      .orderBy(sql`date(${members.createdAt})`),
    db.select({
      levelId: members.levelId,
      name: memberLevels.name,
      count: count(),
    })
      .from(members)
      .leftJoin(memberLevels, eq(memberLevels.id, members.levelId))
      .groupBy(members.levelId, memberLevels.name),
    db.select({
      date: sql<string>`to_char(date(${memberPointTransactions.createdAt}), 'YYYY-MM-DD')`,
      earned: sql<number>`coalesce(sum(case when ${memberPointTransactions.amount} > 0 then ${memberPointTransactions.amount} else 0 end), 0)::int`,
      spent: sql<number>`coalesce(sum(case when ${memberPointTransactions.amount} < 0 then -${memberPointTransactions.amount} else 0 end), 0)::int`,
    })
      .from(memberPointTransactions)
      .where(gte(memberPointTransactions.createdAt, days30Ago))
      .groupBy(sql`date(${memberPointTransactions.createdAt})`)
      .orderBy(sql`date(${memberPointTransactions.createdAt})`),
    db.select({
      date: memberCheckins.checkinDate,
      count: count(),
    })
      .from(memberCheckins)
      .where(gte(memberCheckins.checkinDate, formatDate(days7Ago)))
      .groupBy(memberCheckins.checkinDate)
      .orderBy(memberCheckins.checkinDate),
  ]);

  const axis30 = buildDateAxis(days30Ago, 30);
  const axis7 = buildDateAxis(days7Ago, 7);

  const registerMap = new Map(registerRows.map((r) => [r.date, r.count]));
  const registerTrend = axis30.map((date) => ({ date, count: registerMap.get(date) ?? 0 }));

  const pointMap = new Map(pointRows.map((r) => [r.date, { earned: r.earned, spent: r.spent }]));
  const pointTrend = axis30.map((date) => ({ date, earned: pointMap.get(date)?.earned ?? 0, spent: pointMap.get(date)?.spent ?? 0 }));

  const checkinMap = new Map(checkinRows.map((r) => [r.date, r.count]));
  const checkinTrend = axis7.map((date) => ({ date, count: checkinMap.get(date) ?? 0 }));

  const levelDistribution = levelRows.map((r) => ({ name: r.name ?? '无等级', value: r.count }));

  return { registerTrend, levelDistribution, pointTrend, checkinTrend };
}
