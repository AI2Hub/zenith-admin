import type * as z from 'zod';
import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cmsStatExportQuerySchema, type CmsStatReportRow, type CmsStatScope } from '@zenith/shared/cms';
import { db } from '../../db';
import { keywordCondition } from '../../lib/where-helpers';
import { assertCmsStatisticsAccess, cmsStatsAggregateCte, mapCmsStatMetrics, type SqlMetricRow } from './cms-stats-query';
import { resolveCmsStatsWindow } from './cms-stats-window';

type ExportQuery = z.output<typeof cmsStatExportQuerySchema>;
export type CmsStatisticsExportRow = CmsStatReportRow & {
  reportVersion: string; siteId: number; dimension: string; timeZone: string; startTime: string; endTime: string; watermark: string;
};

export function parseCmsStatisticsExportQuery(query: Record<string, unknown>): ExportQuery {
  const result = cmsStatExportQuerySchema.safeParse(query);
  if (!result.success) throw new HTTPException(400, { message: `统计导出参数无效：${result.error.issues[0]?.message ?? '请检查筛选条件'}` });
  return result.data;
}

export async function prepareCmsStatisticsExportQuery(query: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parsed = parseCmsStatisticsExportQuery(query);
  await assertCmsStatisticsAccess(parsed.siteId);
  const scope = resolveCmsStatsWindow(parsed);
  // Fixed watermark also fixes relative days/end bounds if a queue or retry crosses midnight.
  return { ...parsed, watermark: scope.watermark };
}

/** Aggregate once; count and every batch belong to one repeatable-read snapshot, including derived attribution. */
export async function withCmsStatisticsExportSnapshot(
  query: Record<string, unknown>,
  consume: (rows: AsyncIterable<CmsStatisticsExportRow>, total: number) => Promise<void>,
): Promise<void> {
  const parsed = parseCmsStatisticsExportQuery(query);
  await assertCmsStatisticsAccess(parsed.siteId);
  const scope: CmsStatScope = resolveCmsStatsWindow(parsed);
  const dimension = parsed.dimension ?? 'content';
  const keyword = keywordCondition(parsed.keyword, [sql`label`], 'ilike');
  const filter = keyword ? sql`where ${keyword}` : sql``;
  const sort = sql.identifier(parsed.sortBy ?? 'pv');
  const order = parsed.sortOrder === 'asc' ? sql`asc` : sql`desc`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`create temporary table cms_statistics_export_rows on commit drop as
      ${cmsStatsAggregateCte(parsed, scope, dimension)} select row_number() over(order by ${sort} ${order},key asc)::int as __row,metrics.* from metrics ${filter}`);
    await tx.execute(sql`create unique index on cms_statistics_export_rows (__row)`);
    const [count] = await tx.execute<{ total: number }>(sql`select count(*)::int as total from pg_temp.cms_statistics_export_rows`);
    async function* stream(): AsyncGenerator<CmsStatisticsExportRow> {
      let after = 0;
      for (;;) {
        const rows = await tx.execute<SqlMetricRow & { __row: number }>(sql`select * from pg_temp.cms_statistics_export_rows where __row>${after} order by __row limit 1000`);
        if (!rows.length) return;
        for (const row of rows) yield {
          key: row.key, label: row.label, ...mapCmsStatMetrics(row), siteId: parsed.siteId, dimension,
          reportVersion: parsed.reportVersion, timeZone: scope.timeZone, startTime: scope.startTime, endTime: scope.endTime, watermark: scope.watermark,
        };
        after = rows.at(-1)!.__row;
      }
    }
    await consume(stream(), count?.total ?? 0);
  }, { isolationLevel: 'repeatable read' });
}
