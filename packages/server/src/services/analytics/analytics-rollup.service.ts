import { and, gte, lt, sql, eq, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '../../db';
import { userEvents, analyticsSessions, analyticsDailyRollup, analyticsSettings, errorEvents, errorGroups } from '../../db/schema';
import { clampDays } from '../../lib/analytics-helpers';
import { APP_TIME_ZONE, formatDate, parseDateRangeStart } from '../../lib/datetime';
import { config } from '../../config';
import { currentUser } from '../../lib/context';
import { isPlatformAdmin, getEffectiveTenantId } from '../../lib/tenant';

interface RollupRow { tenantId: number; statDate: string; metric: string; dimType: string; dimValue: string; value: number }

const DAY_MS = 86_400_000;

// 参与每日预聚合的低基数维度（referrer/utmSource 基数不可控，留在 raw 查询路径）
const DIM_SOURCES = [
  { dimType: 'browser', col: userEvents.browser, metric: 'events', onlyPv: false },
  { dimType: 'os', col: userEvents.os, metric: 'events', onlyPv: false },
  { dimType: 'device', col: userEvents.deviceType, metric: 'events', onlyPv: false },
  { dimType: 'region', col: userEvents.region, metric: 'events', onlyPv: false },
  { dimType: 'page', col: userEvents.pagePath, metric: 'pv', onlyPv: true },
] as const;

/** getDimensionBreakdown 可走预聚合的维度集合。 */
export const ROLLUP_DIM_TYPES: ReadonlySet<string> = new Set(DIM_SOURCES.map((d) => d.dimType));

function appTodayStart(): Date {
  return parseDateRangeStart(formatDate(new Date())) ?? new Date();
}

/**
 * rollup 表租户过滤：语义对齐 `tenantScope`，区别是 rollup 的 tenantId 非空，
 * NULL 租户以 0 哨兵存储（见表定义注释）。
 */
export function rollupTenantScope(): SQL | undefined {
  if (!config.multiTenantMode) return undefined;
  const user = currentUser();
  const effective = getEffectiveTenantId(user);
  if (isPlatformAdmin(user) && effective === null) return undefined;
  return eq(analyticsDailyRollup.tenantId, effective ?? 0);
}

/** 重建最近 days 个完整自然日的每日聚合（overall 总量 + 低基数维度分布）。 */
export async function rebuildRollup(daysRaw: unknown): Promise<number> {
  const days = clampDays(daysRaw, 30, 730);
  const todayStart = appTodayStart();
  const start = new Date(todayStart.getTime() - days * DAY_MS);

  const eventRows = await db
    .select({
      tenantId: sql<number>`COALESCE(${userEvents.tenantId}, 0)`,
      statDate: sql<string>`to_char(timezone(${APP_TIME_ZONE}, ${userEvents.createdAt}), 'YYYY-MM-DD')`,
      pv: sql<number>`COUNT(*) FILTER (WHERE ${userEvents.eventType} = 'page_view')::int`,
      uv: sql<number>`COUNT(DISTINCT ${userEvents.distinctId})::int`,
      events: sql<number>`COUNT(*)::int`,
      sessions: sql<number>`COUNT(DISTINCT ${userEvents.sessionId})::int`,
    })
    .from(userEvents)
    .where(and(gte(userEvents.createdAt, start), lt(userEvents.createdAt, todayStart)))
    .groupBy(sql`1, 2`);

  const sessionRows = await db
    .select({
      tenantId: sql<number>`COALESCE(${analyticsSessions.tenantId}, 0)`,
      statDate: sql<string>`to_char(timezone(${APP_TIME_ZONE}, ${analyticsSessions.startedAt}), 'YYYY-MM-DD')`,
      bounce: sql<number>`COUNT(*) FILTER (WHERE ${analyticsSessions.isBounce})::int`,
      dwell: sql<number>`COALESCE(SUM(${analyticsSessions.durationMs}), 0)::bigint`,
    })
    .from(analyticsSessions)
    .where(and(gte(analyticsSessions.startedAt, start), lt(analyticsSessions.startedAt, todayStart)))
    .groupBy(sql`1, 2`);

  const upserts: RollupRow[] = [];
  const overall = (r: { tenantId: number; statDate: string }, metric: string, value: number) =>
    upserts.push({ tenantId: Number(r.tenantId), statDate: r.statDate, metric, dimType: 'overall', dimValue: '', value });

  for (const r of eventRows) {
    overall(r, 'pv', Number(r.pv));
    overall(r, 'uv', Number(r.uv));
    overall(r, 'events', Number(r.events));
    overall(r, 'sessions', Number(r.sessions));
  }
  for (const r of sessionRows) {
    overall(r, 'bounce_sessions', Number(r.bounce));
    overall(r, 'total_dwell_ms', Number(r.dwell));
  }

  // ── 维度聚合（NULL 维度值以 '' 哨兵存储，查询侧映射回「未知」）──────────────
  for (const dim of DIM_SOURCES) {
    const conditions = [gte(userEvents.createdAt, start), lt(userEvents.createdAt, todayStart)];
    if (dim.onlyPv) conditions.push(eq(userEvents.eventType, 'page_view'));
    const rows = await db
      .select({
        tenantId: sql<number>`COALESCE(${userEvents.tenantId}, 0)`,
        statDate: sql<string>`to_char(timezone(${APP_TIME_ZONE}, ${userEvents.createdAt}), 'YYYY-MM-DD')`,
        dimValue: sql<string>`COALESCE(${dim.col}::text, '')`,
        value: sql<number>`COUNT(*)::int`,
      })
      .from(userEvents)
      .where(and(...conditions))
      .groupBy(sql`1, 2, 3`);
    for (const r of rows) {
      upserts.push({ tenantId: Number(r.tenantId), statDate: r.statDate, metric: dim.metric, dimType: dim.dimType, dimValue: r.dimValue.slice(0, 256), value: Number(r.value) });
    }
  }

  // 批量 UPSERT（分片规避参数上限；同批内 (tenant,date,metric,dim,dimValue) 天然唯一）
  const CHUNK = 500;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK);
    await db
      .insert(analyticsDailyRollup)
      .values(chunk)
      .onConflictDoUpdate({
        target: [analyticsDailyRollup.tenantId, analyticsDailyRollup.statDate, analyticsDailyRollup.metric, analyticsDailyRollup.dimType, analyticsDailyRollup.dimValue],
        set: { value: sql`excluded.value` },
      });
  }

  return upserts.length;
}

export interface RollupSummaryItem {
  statDate: string;
  pv: number;
  uv: number;
  sessions: number;
  events: number;
  bounceSessions: number;
  totalDwellMs: number;
}

/** 读取每日聚合（供数据管理「数据聚合」面板展示）。 */
export async function getRollupSummary(daysRaw: unknown): Promise<RollupSummaryItem[]> {
  const days = clampDays(daysRaw, 30, 730);
  const todayStart = appTodayStart();
  const start = new Date(todayStart.getTime() - days * DAY_MS);
  const startStr = formatDate(start);

  const rows = await db
    .select({ statDate: analyticsDailyRollup.statDate, metric: analyticsDailyRollup.metric, value: analyticsDailyRollup.value })
    .from(analyticsDailyRollup)
    .where(and(eq(analyticsDailyRollup.dimType, 'overall'), gte(analyticsDailyRollup.statDate, startStr)));

  const byDate = new Map<string, RollupSummaryItem>();
  for (const r of rows) {
    const item = byDate.get(r.statDate) ?? { statDate: r.statDate, pv: 0, uv: 0, sessions: 0, events: 0, bounceSessions: 0, totalDwellMs: 0 };
    if (r.metric === 'pv') item.pv = Number(r.value);
    else if (r.metric === 'uv') item.uv = Number(r.value);
    else if (r.metric === 'sessions') item.sessions = Number(r.value);
    else if (r.metric === 'events') item.events = Number(r.value);
    else if (r.metric === 'bounce_sessions') item.bounceSessions = Number(r.value);
    else if (r.metric === 'total_dwell_ms') item.totalDwellMs = Number(r.value);
    byDate.set(r.statDate, item);
  }
  return [...byDate.values()].sort((a, b) => b.statDate.localeCompare(a.statDate));
}

/** 按保留策略清理过期埋点/会话/错误数据（cron）。 */
export async function runAnalyticsRetention(): Promise<{ events: number; sessions: number; errors: number }> {
  const rc = (r: unknown) => (r as { rowCount?: number }).rowCount ?? 0;
  const [policies, eventTenants, sessionTenants, errorEventTenants, errorGroupTenants] = await Promise.all([
    db.select({
      tenantId: analyticsSettings.tenantId,
      eventDays: analyticsSettings.retentionDays,
      errorDays: analyticsSettings.errorRetentionDays,
    }).from(analyticsSettings),
    db.selectDistinct({ tenantId: userEvents.tenantId }).from(userEvents),
    db.selectDistinct({ tenantId: analyticsSessions.tenantId }).from(analyticsSessions),
    db.selectDistinct({ tenantId: errorEvents.tenantId }).from(errorEvents),
    db.selectDistinct({ tenantId: errorGroups.tenantId }).from(errorGroups),
  ]);
  const policyByTenant = new Map(policies.map((policy) => [policy.tenantId, policy]));
  const tenantIds = new Set<number | null>([
    ...policies.map((row) => row.tenantId),
    ...eventTenants.map((row) => row.tenantId),
    ...sessionTenants.map((row) => row.tenantId),
    ...errorEventTenants.map((row) => row.tenantId),
    ...errorGroupTenants.map((row) => row.tenantId),
  ]);

  let deletedEvents = 0;
  let deletedSessions = 0;
  let deletedErrors = 0;
  for (const tenantId of tenantIds) {
    const policy = policyByTenant.get(tenantId);
    const eventDays = policy?.eventDays ?? 180;
    const errorDays = policy?.errorDays ?? 90;
    const eventTenant = tenantId === null ? isNull(userEvents.tenantId) : eq(userEvents.tenantId, tenantId);
    const sessionTenant = tenantId === null ? isNull(analyticsSessions.tenantId) : eq(analyticsSessions.tenantId, tenantId);
    const errorEventTenant = tenantId === null ? isNull(errorEvents.tenantId) : eq(errorEvents.tenantId, tenantId);
    const errorGroupTenant = tenantId === null ? isNull(errorGroups.tenantId) : eq(errorGroups.tenantId, tenantId);
    const [evRes, sessRes, errEvRes] = await Promise.all([
      db.delete(userEvents).where(and(eventTenant, sql`${userEvents.createdAt} < NOW() - (${eventDays} * INTERVAL '1 day')`)),
      db.delete(analyticsSessions).where(and(sessionTenant, sql`${analyticsSessions.startedAt} < NOW() - (${eventDays} * INTERVAL '1 day')`)),
      db.delete(errorEvents).where(and(errorEventTenant, sql`${errorEvents.createdAt} < NOW() - (${errorDays} * INTERVAL '1 day')`)),
    ]);
    await db.delete(errorGroups).where(and(
      errorGroupTenant,
      sql`${errorGroups.lastSeenAt} < NOW() - (${errorDays} * INTERVAL '1 day')`,
      sql`NOT EXISTS (SELECT 1 FROM error_events ee WHERE ee.group_id = ${errorGroups.id})`,
    ));
    deletedEvents += rc(evRes);
    deletedSessions += rc(sessRes);
    deletedErrors += rc(errEvRes);
  }
  return { events: deletedEvents, sessions: deletedSessions, errors: deletedErrors };
}
