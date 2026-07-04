import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../db';
import { aiMessages, aiConversations, users } from '../../db/schema';
import { parseDateRangeStart, parseDateRangeEnd } from '../../lib/datetime';

export interface UsageRange {
  startDate?: string;
  endDate?: string;
}

/** 消息时间范围条件（基于 ai_messages.created_at） */
function messageRangeConds(range: UsageRange) {
  const conds = [] as ReturnType<typeof gte>[];
  const start = range.startDate ? parseDateRangeStart(range.startDate) : null;
  const end = range.endDate ? parseDateRangeEnd(range.endDate) : null;
  if (start) conds.push(gte(aiMessages.createdAt, start));
  if (end) conds.push(lte(aiMessages.createdAt, end));
  return conds;
}

const MODEL_EXPR = sql<string>`coalesce(${aiMessages.model}, ${aiConversations.providerSnapshot}->>'model', '未知')`;
const TOTAL_TOKENS_EXPR = sql<number>`coalesce(sum(${aiMessages.tokensInput} + ${aiMessages.tokensOutput}),0)::int`;

export async function getUsageOverview(range: UsageRange) {
  const msgConds = messageRangeConds(range);
  const msgWhere = msgConds.length ? and(...msgConds) : undefined;

  // 对话数 / 活跃用户：以「在范围内有消息」的对话为准
  const [aggMsg] = await db
    .select({
      totalMessages: sql<number>`count(*)::int`,
      tokensInput: sql<number>`coalesce(sum(${aiMessages.tokensInput}),0)::int`,
      tokensOutput: sql<number>`coalesce(sum(${aiMessages.tokensOutput}),0)::int`,
    })
    .from(aiMessages)
    .where(msgWhere);

  const [aggConv] = await db
    .select({
      totalConversations: sql<number>`count(distinct ${aiConversations.id})::int`,
      activeUsers: sql<number>`count(distinct ${aiConversations.userId})::int`,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .where(msgWhere);

  return {
    totalConversations: aggConv?.totalConversations ?? 0,
    totalMessages: aggMsg?.totalMessages ?? 0,
    tokensInput: aggMsg?.tokensInput ?? 0,
    tokensOutput: aggMsg?.tokensOutput ?? 0,
    totalTokens: (aggMsg?.tokensInput ?? 0) + (aggMsg?.tokensOutput ?? 0),
    activeUsers: aggConv?.activeUsers ?? 0,
  };
}

export async function getUsageByModel(range: UsageRange) {
  const msgConds = messageRangeConds(range);
  const rows = await db
    .select({
      model: MODEL_EXPR,
      messages: sql<number>`count(${aiMessages.id})::int`,
      tokensInput: sql<number>`coalesce(sum(${aiMessages.tokensInput}),0)::int`,
      tokensOutput: sql<number>`coalesce(sum(${aiMessages.tokensOutput}),0)::int`,
      totalTokens: TOTAL_TOKENS_EXPR,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .where(msgConds.length ? and(...msgConds) : undefined)
    .groupBy(MODEL_EXPR)
    .orderBy(desc(TOTAL_TOKENS_EXPR));
  return rows;
}

export async function getUsageByUser(range: UsageRange, limit = 10) {
  const msgConds = messageRangeConds(range);
  const rows = await db
    .select({
      userId: aiConversations.userId,
      username: users.username,
      nickname: users.nickname,
      conversations: sql<number>`count(distinct ${aiConversations.id})::int`,
      messages: sql<number>`count(${aiMessages.id})::int`,
      totalTokens: TOTAL_TOKENS_EXPR,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .innerJoin(users, eq(aiConversations.userId, users.id))
    .where(msgConds.length ? and(...msgConds) : undefined)
    .groupBy(aiConversations.userId, users.username, users.nickname)
    .orderBy(desc(TOTAL_TOKENS_EXPR))
    .limit(limit);
  return rows;
}

export async function getUsageTrend(range: UsageRange) {
  const msgConds = messageRangeConds(range);
  const dateExpr = sql<string>`to_char(${aiMessages.createdAt}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      date: dateExpr,
      messages: sql<number>`count(*)::int`,
      totalTokens: TOTAL_TOKENS_EXPR,
    })
    .from(aiMessages)
    .where(msgConds.length ? and(...msgConds) : undefined)
    .groupBy(dateExpr)
    .orderBy(dateExpr);
  return rows;
}

/** 仪表盘一次性聚合（概览 + 按模型 + 按用户 Top10 + 按日趋势） */
export async function getUsageStats(range: UsageRange) {
  const [overview, byModel, byUser, trend] = await Promise.all([
    getUsageOverview(range),
    getUsageByModel(range),
    getUsageByUser(range, 10),
    getUsageTrend(range),
  ]);
  return { overview, byModel, byUser, trend };
}
