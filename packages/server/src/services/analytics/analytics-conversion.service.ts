/**
 * 行为中心阶段 1：有序转化漏斗 + 双口径留存分析。
 *
 * 从 analytics.service.ts 抽出（原实现为集合交集漏斗 + 单口径留存），
 * 遵循 Zenith 重构边界约定：新增查询不再继续塞入越来越臃肿的 analytics.service.ts。
 *
 * 安全设计：
 *  - 漏斗/留存均强制 tenantScope，参数化查询，禁止 sql.raw(用户输入)
 *  - 漏斗 segmentId 仅作用于首步，调用前经 ensureSegmentAccessible 校验分群 tenant 归属
 *  - 漏斗步骤属性过滤复用 analytics-property-filter 的白名单 key 正则 + 绑定参数比较
 */
import { and, eq, gte, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { userEvents } from '../../db/schema';
import type { FunnelQuery, FunnelResult, RetentionResult, AnalyticsRetentionMode } from '@zenith/shared';
import { tenantScope } from '../../lib/tenant';
import { mergeWhere } from '../../lib/where-helpers';
import { clampDays, startOfDaysAgo } from '../../lib/analytics-helpers';
import { APP_TIME_ZONE } from '../../lib/datetime';
import { dateAxis } from './analytics.service';
import { buildJsonPropertyCondition } from './analytics-property-filter';
import { ensureSegmentAccessible, segmentMemberDistinctIdSubquery } from './analytics-segments.service';

// ════════════════════════════════════════════════════════════════════════════
// 漏斗分析（有序转化：严格步骤先后顺序 + 转化窗口）
// ════════════════════════════════════════════════════════════════════════════

function clampConversionWindowHours(hours: unknown): number {
  return Math.min(Math.max(Number(hours) || 72, 1), 720);
}

/** 单步的事件/页面/属性过滤条件（不含时间窗，时间窗由调用方按 CTE 层级拼接）。 */
function buildStepConditions(step: FunnelQuery['steps'][number]): SQL[] {
  const conditions: SQL[] = [];
  if (step.eventType) conditions.push(eq(userEvents.eventType, step.eventType));
  if (step.eventName) conditions.push(eq(userEvents.eventName, step.eventName));
  if (step.pagePath) conditions.push(eq(userEvents.pagePath, step.pagePath));
  if (step.elementKey) conditions.push(eq(userEvents.elementKey, step.elementKey));
  for (const f of step.properties ?? []) conditions.push(buildJsonPropertyCondition(userEvents.properties, f));
  return conditions;
}

/**
 * 有序转化漏斗：
 *  - s0：每用户完成首步的最早事件时间（first_at = step_at）
 *  - sN（N>0）：针对 sN-1 每用户，取时间 >= 上一步事件时间 且 <= 首步时间 + 转化窗口 的下一步最早事件，
 *    从而保证严格的步骤先后顺序（允许同一时刻发生）
 *  - segmentId 仅作用于首步（先圈定分群成员，再在该子集内计算漏斗转化）
 */
export async function getFunnel(input: FunnelQuery): Promise<FunnelResult> {
  const days = clampDays(input.days, 30);
  const start = startOfDaysAgo(days);
  const windowHours = clampConversionWindowHours(input.conversionWindowHours);
  if (!input.steps || input.steps.length === 0) return { steps: [], totalUsers: 0, overallConversionRate: 0 };

  if (input.segmentId) await ensureSegmentAccessible(input.segmentId);

  const ctes: SQL[] = input.steps.map((step, i) => {
    const stepConditions = buildStepConditions(step);
    if (i === 0) {
      const conditions: SQL[] = [gte(userEvents.createdAt, start), isNotNull(userEvents.distinctId), ...stepConditions];
      if (input.segmentId) conditions.push(inArray(userEvents.distinctId, segmentMemberDistinctIdSubquery(input.segmentId)));
      const where = mergeWhere(and(...conditions), tenantScope(userEvents))!;
      return sql`${sql.raw(`s${i}`)} AS (
        SELECT ${userEvents.distinctId} AS distinct_id,
               MIN(${userEvents.createdAt}) AS first_at,
               MIN(${userEvents.createdAt}) AS step_at,
               NULL::bigint AS step_delta_ms
        FROM ${userEvents}
        WHERE ${where}
        GROUP BY ${userEvents.distinctId}
      )`;
    }
    const conditions: SQL[] = [isNotNull(userEvents.distinctId), ...stepConditions];
    const where = mergeWhere(and(...conditions), tenantScope(userEvents))!;
    const prevAlias = sql.raw(`s${i - 1}`);
    return sql`${sql.raw(`s${i}`)} AS (
      SELECT prev.distinct_id AS distinct_id,
             prev.first_at AS first_at,
             MIN(${userEvents.createdAt}) AS step_at,
             (EXTRACT(EPOCH FROM (MIN(${userEvents.createdAt}) - prev.step_at)) * 1000)::bigint AS step_delta_ms
      FROM ${prevAlias} prev
      JOIN ${userEvents} ON ${userEvents.distinctId} = prev.distinct_id
        AND ${userEvents.createdAt} >= prev.step_at
        AND ${userEvents.createdAt} <= prev.first_at + make_interval(hours => ${windowHours})
        AND ${where}
      GROUP BY prev.distinct_id, prev.first_at, prev.step_at
    )`;
  });

  const countSelects = input.steps.map((_, i) => sql`(SELECT COUNT(*) FROM ${sql.raw(`s${i}`)})::int AS ${sql.raw(`c${i}`)}`);
  const avgSelects = input.steps.map((_, i) => (i === 0
    ? sql`NULL::float AS ${sql.raw(`a${i}`)}`
    : sql`(SELECT AVG(step_delta_ms) FROM ${sql.raw(`s${i}`)})::float AS ${sql.raw(`a${i}`)}`));

  const rows = (await db.execute(
    sql`WITH ${sql.join(ctes, sql`, `)} SELECT ${sql.join([...countSelects, ...avgSelects], sql`, `)}`,
  )) as unknown as Array<Record<string, number | null>>;
  const countRow = rows[0] ?? {};

  const totalUsers = Number(countRow.c0 ?? 0);
  let prevUsers = totalUsers;
  const steps = input.steps.map((step, i) => {
    const users = Number(countRow[`c${i}`] ?? 0);
    const avgRaw = countRow[`a${i}`];
    const result = {
      label: step.label,
      users,
      conversionRate: totalUsers > 0 ? Math.round((users / totalUsers) * 1000) / 10 : 0,
      stepConversionRate: prevUsers > 0 ? Math.round((users / prevUsers) * 1000) / 10 : 0,
      dropoff: Math.max(0, prevUsers - users),
      averageConversionMs: i === 0 || avgRaw == null ? null : Math.round(Number(avgRaw)),
    };
    prevUsers = users;
    return result;
  });

  const finalUsers = steps.at(-1)?.users ?? 0;
  return { steps, totalUsers, overallConversionRate: totalUsers > 0 ? Math.round((finalUsers / totalUsers) * 1000) / 10 : 0 };
}

// ════════════════════════════════════════════════════════════════════════════
// 留存分析（双口径：first_seen 全历史真实首访 / window_first 当前窗口首现）
// ════════════════════════════════════════════════════════════════════════════

export interface RetentionQuery { days: unknown; mode?: AnalyticsRetentionMode }

/**
 * - window_first（默认口径不变）：队列 = 用户在本次查询窗口内首次出现的日期（原有实现）
 * - first_seen：队列 = 用户在全部历史（不受本次查询窗口限制）中真正首次出现的日期，
 *   仅保留首次日落在本次分析轴内的队列；真实首访日的 MIN() 计算不能提前做日期过滤，
 *   否则会把"窗口内首次出现"误判为"全局首次出现"
 */
export async function getRetention(input: RetentionQuery): Promise<RetentionResult> {
  const days = clampDays(input.days, 14, 60);
  const mode: AnalyticsRetentionMode = input.mode === 'first_seen' ? 'first_seen' : 'window_first';
  const start = startOfDaysAgo(days);
  const axis = dateAxis(days);
  const axisStart = axis[0];
  const axisEnd = axis[axis.length - 1];
  const activityWhere = mergeWhere(and(gte(userEvents.createdAt, start), isNotNull(userEvents.distinctId)), tenantScope(userEvents))!;

  let rows: Array<{ cohort_date: string; day: string; active: number }>;
  if (mode === 'first_seen') {
    // 全历史（仅 tenantScope，无日期过滤）计算真实首访日，避免把窗口起点误当作全局首访起点
    const historyWhere = mergeWhere(isNotNull(userEvents.distinctId), tenantScope(userEvents))!;
    rows = (await db.execute(sql`
      WITH activity AS (
        SELECT DISTINCT ${userEvents.distinctId} AS distinct_id,
               to_char(timezone(${APP_TIME_ZONE}, ${userEvents.createdAt}), 'YYYY-MM-DD') AS day
        FROM ${userEvents}
        WHERE ${activityWhere}
      ),
      true_first_seen AS (
        SELECT ${userEvents.distinctId} AS distinct_id,
               to_char(timezone(${APP_TIME_ZONE}, MIN(${userEvents.createdAt})), 'YYYY-MM-DD') AS cohort_date
        FROM ${userEvents}
        WHERE ${historyWhere}
        GROUP BY ${userEvents.distinctId}
      )
      SELECT f.cohort_date AS cohort_date, a.day AS day, COUNT(*)::int AS active
      FROM activity a
      JOIN true_first_seen f ON f.distinct_id = a.distinct_id
      WHERE f.cohort_date >= ${axisStart} AND f.cohort_date <= ${axisEnd}
      GROUP BY 1, 2
    `)) as unknown as Array<{ cohort_date: string; day: string; active: number }>;
  } else {
    rows = (await db.execute(sql`
      WITH user_days AS (
        SELECT DISTINCT ${userEvents.distinctId} AS distinct_id,
               to_char(timezone(${APP_TIME_ZONE}, ${userEvents.createdAt}), 'YYYY-MM-DD') AS day
        FROM ${userEvents}
        WHERE ${activityWhere}
      ),
      first_day AS (
        SELECT distinct_id, MIN(day) AS cohort_date FROM user_days GROUP BY 1
      )
      SELECT f.cohort_date AS cohort_date, ud.day AS day, COUNT(*)::int AS active
      FROM user_days ud
      JOIN first_day f ON f.distinct_id = ud.distinct_id
      GROUP BY 1, 2
    `)) as unknown as Array<{ cohort_date: string; day: string; active: number }>;
  }

  const matrix = new Map<string, number>();
  for (const r of rows) matrix.set(`${r.cohort_date}\u0001${r.day}`, Number(r.active));

  const maxPeriods = Math.min(days, 8);
  const periods = Array.from({ length: maxPeriods }, (_, i) => i);

  const cohorts = axis.map((cohortDate, ci) => {
    // 队列用户首日必然活跃：矩阵对角线即队列规模
    const size = matrix.get(`${cohortDate}\u0001${cohortDate}`) ?? 0;
    const values = periods.map((p) => {
      const targetStr = axis[ci + p];
      if (targetStr === undefined) return null;
      if (size === 0) return 0;
      const active = matrix.get(`${cohortDate}\u0001${targetStr}`) ?? 0;
      return Math.round((active / size) * 1000) / 10;
    });
    return { cohortDate, cohortSize: size, values };
  });

  return { cohorts, periods, mode };
}
