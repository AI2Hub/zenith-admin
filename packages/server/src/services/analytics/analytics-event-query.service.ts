/**
 * 行为中心阶段 1：通用事件分析工作台（自助查询）。
 *
 * 安全设计：
 *  - groupBy 维度、metric 均为白名单枚举（来自 @zenith/shared），不接受任意列名/原始 SQL
 *  - 属性过滤 key 经严格正则校验，值全部绑定参数，杜绝注入
 *  - segmentId 先校验 tenant 归属，再通过 analytics_segment_members 子查询过滤 distinctId
 *  - 所有查询强制 tenantScope
 */
import { and, eq, gte, inArray, lte, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../db';
import { userEvents } from '../../db/schema';
import type { AnalyticsEventQueryInput, AnalyticsEventQueryResult, AnalyticsEventQueryGroupByField } from '@zenith/shared';
import { tenantScope } from '../../lib/tenant';
import { mergeWhere } from '../../lib/where-helpers';
import { APP_TIME_ZONE, formatDate, parseDateRangeStart, parseDateRangeEnd } from '../../lib/datetime';
import { clampDays } from '../../lib/analytics-helpers';
import { buildJsonPropertyCondition } from './analytics-property-filter';
import { ensureSegmentAccessible, segmentMemberDistinctIdSubquery } from './analytics-segments.service';

/** 分组维度白名单 → Drizzle column / SQL 表达式映射，禁止任意列名拼接 */
function groupByExpr(field: AnalyticsEventQueryGroupByField): SQL | PgColumn {
  switch (field) {
    case 'date':
      return sql<string>`to_char(timezone(${APP_TIME_ZONE}, ${userEvents.createdAt}), 'YYYY-MM-DD')`;
    case 'eventName':
      return userEvents.eventName;
    case 'pagePath':
      return userEvents.pagePath;
    case 'source':
      return userEvents.source;
    case 'appId':
      return userEvents.appId;
    case 'environment':
      return userEvents.environment;
    case 'browser':
      return userEvents.browser;
    case 'os':
      return userEvents.os;
    case 'deviceType':
      return userEvents.deviceType;
    case 'region':
      return userEvents.region;
    default:
      throw new HTTPException(400, { message: `不支持的分组维度：${field as string}` });
  }
}

function resolveDateRange(input: { startDate?: string; endDate?: string; days?: number }) {
  if (input.startDate && input.endDate) {
    const start = parseDateRangeStart(input.startDate);
    const end = parseDateRangeEnd(input.endDate);
    if (start && end && end >= start) {
      return { start, end, startLabel: input.startDate, endLabel: input.endDate };
    }
  }
  const days = clampDays(input.days, 30);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start, end, startLabel: formatDate(start), endLabel: formatDate(end) };
}

/** 通用事件分析：白名单维度分组 + 事件次数/去重用户数统计，返回 rows/total/queryMeta。 */
export async function queryEvents(input: AnalyticsEventQueryInput): Promise<AnalyticsEventQueryResult> {
  const groupBy = (input.groupBy && input.groupBy.length > 0 ? input.groupBy : (['date'] as AnalyticsEventQueryGroupByField[])).slice(0, 2);
  const metric = input.metric === 'uv' ? 'uv' : 'events';
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 200);
  const { start, end, startLabel, endLabel } = resolveDateRange(input);

  const conditions: SQL[] = [gte(userEvents.createdAt, start), lte(userEvents.createdAt, end), isNotNull(userEvents.distinctId)];
  if (input.eventNames && input.eventNames.length > 0) {
    conditions.push(inArray(userEvents.eventName, input.eventNames.slice(0, 20)));
  }
  if (input.source) conditions.push(eq(userEvents.source, input.source));
  if (input.appId) conditions.push(eq(userEvents.appId, input.appId));
  if (input.environment) conditions.push(eq(userEvents.environment, input.environment));
  if (input.deviceType) conditions.push(eq(userEvents.deviceType, input.deviceType));
  for (const filter of (input.propertyFilters ?? []).slice(0, 10)) {
    conditions.push(buildJsonPropertyCondition(userEvents.properties, filter));
  }
  if (input.segmentId) {
    await ensureSegmentAccessible(input.segmentId);
    conditions.push(inArray(userEvents.distinctId, segmentMemberDistinctIdSubquery(input.segmentId)));
  }
  const where = mergeWhere(and(...conditions), tenantScope(userEvents));

  const groupByExprs = groupBy.map((g) => groupByExpr(g));
  const valueExpr = metric === 'uv'
    ? sql<number>`COUNT(DISTINCT ${userEvents.distinctId})::int`
    : sql<number>`COUNT(*)::int`;
  const orderExpr = metric === 'uv'
    ? sql`COUNT(DISTINCT ${userEvents.distinctId}) DESC`
    : sql`COUNT(*) DESC`;
  const dateIndex = groupBy.indexOf('date');
  const orderByExprs: Array<SQL | PgColumn> = dateIndex >= 0
    ? [groupByExprs[dateIndex], ...groupByExprs.filter((_, index) => index !== dateIndex)]
    : [orderExpr];

  const selectShape: Record<string, SQL | PgColumn> = { value: valueExpr, __total: sql<number>`COUNT(*) OVER()::int` };
  groupBy.forEach((g, i) => { selectShape[`d${i}`] = groupByExprs[i]; });

  const rows = (await db
    .select(selectShape)
    .from(userEvents)
    .where(where)
    .groupBy(...groupByExprs)
    .orderBy(...orderByExprs)
    .limit(limit)) as unknown as Array<Record<string, unknown>>;

  const total = rows.length > 0 ? Number(rows[0].__total ?? rows.length) : 0;

  return {
    rows: rows.map((r) => ({
      dimensions: Object.fromEntries(groupBy.map((g, i) => [g, String(r[`d${i}`] ?? '')])),
      value: Number(r.value ?? 0),
    })),
    total,
    queryMeta: { metric, groupBy, startDate: startLabel, endDate: endLabel },
  };
}
