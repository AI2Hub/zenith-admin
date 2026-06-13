import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { userEvents } from '../db/schema';
import { currentUser } from '../lib/context';
import { tenantScope, currentCreateTenantId } from '../lib/tenant';
import { mergeWhere } from '../lib/where-helpers';

export interface BatchEventInput {
  sessionId: string;
  eventType: 'page_view' | 'page_leave' | 'feature_use' | 'area_click';
  pagePath: string;
  pageTitle?: string;
  elementKey?: string;
  elementLabel?: string;
  componentArea?: string;
  clickX?: number;
  clickY?: number;
  durationMs?: number;
}

export async function batchInsertEvents(events: BatchEventInput[]) {
  if (events.length === 0) return;
  const user = currentUser();
  const tenantId = currentCreateTenantId();
  const rows = events.map((e) => ({
    userId: user.userId,
    username: user.username,
    tenantId,
    sessionId: e.sessionId,
    eventType: e.eventType,
    pagePath: e.pagePath,
    pageTitle: e.pageTitle ?? null,
    elementKey: e.elementKey ?? null,
    elementLabel: e.elementLabel ?? null,
    componentArea: e.componentArea ?? null,
    clickX: e.clickX ?? null,
    clickY: e.clickY ?? null,
    durationMs: e.durationMs ?? null,
  }));
  await db.insert(userEvents).values(rows);
}

export interface PageStatsQuery {
  days?: number;
  limit?: number;
}

export async function getPageStats(q: PageStatsQuery) {
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where = mergeWhere(
    and(
      eq(userEvents.eventType, 'page_leave'),
      isNotNull(userEvents.durationMs),
      gte(userEvents.createdAt, startDate),
    ),
    tenantScope(userEvents),
  );

  const rows = await db
    .select({
      pagePath: userEvents.pagePath,
      pageTitle: sql<string | null>`MAX(${userEvents.pageTitle})`,
      visits: sql<number>`COUNT(*)::integer`,
      avgMs: sql<number | null>`ROUND(AVG(${userEvents.durationMs}))::integer`,
      medianMs: sql<number | null>`(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${userEvents.durationMs}))::integer`,
      p90Ms: sql<number | null>`(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ${userEvents.durationMs}))::integer`,
    })
    .from(userEvents)
    .where(where)
    .groupBy(userEvents.pagePath)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  const items = rows.map((r) => ({
    pagePath: r.pagePath,
    pageTitle: r.pageTitle,
    visits: Number(r.visits),
    avgMs: r.avgMs != null ? Number(r.avgMs) : null,
    medianMs: r.medianMs != null ? Number(r.medianMs) : null,
    p90Ms: r.p90Ms != null ? Number(r.p90Ms) : null,
  }));

  return {
    items,
    totalVisits: items.reduce((sum, i) => sum + i.visits, 0),
  };
}

export interface FeatureStatsQuery {
  days?: number;
  limit?: number;
  pagePath?: string;
}

export async function getFeatureStats(q: FeatureStatsQuery) {
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(q.limit) || 30, 1), 100);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const conditions = [
    eq(userEvents.eventType, 'feature_use'),
    isNotNull(userEvents.elementKey),
    gte(userEvents.createdAt, startDate),
  ];
  if (q.pagePath) conditions.push(eq(userEvents.pagePath, q.pagePath));

  const where = mergeWhere(and(...conditions), tenantScope(userEvents));

  const rows = await db
    .select({
      pagePath: userEvents.pagePath,
      elementKey: sql<string>`MAX(${userEvents.elementKey})`,
      elementLabel: sql<string | null>`MAX(${userEvents.elementLabel})`,
      componentArea: sql<string | null>`MAX(${userEvents.componentArea})`,
      count: sql<number>`COUNT(*)::integer`,
    })
    .from(userEvents)
    .where(where)
    .groupBy(userEvents.pagePath, userEvents.elementKey)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  const items = rows.map((r) => ({
    pagePath: r.pagePath,
    elementKey: r.elementKey,
    elementLabel: r.elementLabel,
    componentArea: r.componentArea,
    count: Number(r.count),
  }));

  return {
    items,
    totalEvents: items.reduce((sum, i) => sum + i.count, 0),
  };
}

export interface HeatmapQuery {
  pagePath: string;
  componentArea: string;
  days?: number;
}

export async function getHeatmapData(q: HeatmapQuery) {
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where = mergeWhere(
    and(
      eq(userEvents.eventType, 'area_click'),
      eq(userEvents.pagePath, q.pagePath),
      eq(userEvents.componentArea, q.componentArea),
      isNotNull(userEvents.clickX),
      isNotNull(userEvents.clickY),
      gte(userEvents.createdAt, startDate),
    ),
    tenantScope(userEvents),
  );

  const rows = await db
    .select({ x: userEvents.clickX, y: userEvents.clickY })
    .from(userEvents)
    .where(where)
    .limit(5000);

  // Bin into 50×50 grid cells (each cell = 2% × 2% of component area)
  const BINS = 50;
  const cellMap = new Map<string, number>();
  for (const r of rows) {
    if (r.x == null || r.y == null) continue;
    const cx = Math.min(Math.floor((r.x / 100) * BINS), BINS - 1);
    const cy = Math.min(Math.floor((r.y / 100) * BINS), BINS - 1);
    const key = `${cx},${cy}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
  }

  const points = Array.from(cellMap.entries()).map(([key, value]) => {
    const [cx, cy] = key.split(',').map(Number);
    return {
      x: (cx / BINS) * 100 + 100 / BINS / 2,
      y: (cy / BINS) * 100 + 100 / BINS / 2,
      value,
    };
  });

  return {
    pagePath: q.pagePath,
    componentArea: q.componentArea,
    points,
    total: rows.length,
  };
}

export interface HeatmapPageListQuery {
  days?: number;
}

export async function getHeatmapPageList(q: HeatmapPageListQuery) {
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where = mergeWhere(
    and(
      eq(userEvents.eventType, 'area_click'),
      isNotNull(userEvents.pagePath),
      isNotNull(userEvents.componentArea),
      gte(userEvents.createdAt, startDate),
    ),
    tenantScope(userEvents),
  );

  const rows = await db
    .select({
      pagePath: userEvents.pagePath,
      pageTitle: sql<string | null>`MAX(${userEvents.pageTitle})`,
      componentArea: userEvents.componentArea,
    })
    .from(userEvents)
    .where(where)
    .groupBy(userEvents.pagePath, userEvents.componentArea)
    .orderBy(userEvents.pagePath);

  // Group areas by page
  const pageMap = new Map<string, { pagePath: string; pageTitle: string | null; areas: Set<string> }>();
  for (const r of rows) {
    if (!r.componentArea) continue;
    if (!pageMap.has(r.pagePath)) {
      pageMap.set(r.pagePath, { pagePath: r.pagePath, pageTitle: r.pageTitle, areas: new Set() });
    }
    pageMap.get(r.pagePath)!.areas.add(r.componentArea);
  }

  return {
    pages: Array.from(pageMap.values()).map((p) => ({
      pagePath: p.pagePath,
      pageTitle: p.pageTitle,
      areas: Array.from(p.areas),
    })),
  };
}
