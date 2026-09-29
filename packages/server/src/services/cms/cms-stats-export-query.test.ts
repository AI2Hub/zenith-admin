import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CMS_STAT_REPORT_VERSION } from '@zenith/shared/cms';

const calls = vi.hoisted(() => ({ access: vi.fn(), execute: vi.fn(), transaction: vi.fn(), aggregate: vi.fn(), active: false }));
vi.mock('../../db', () => ({ db: { transaction: calls.transaction } }));
vi.mock('./cms-stats-query', () => ({ assertCmsStatisticsAccess: calls.access, cmsStatsAggregateCte: calls.aggregate, mapCmsStatMetrics: (row: { pv: number }) => ({ pv: row.pv }) }));
import { prepareCmsStatisticsExportQuery, withCmsStatisticsExportSnapshot } from './cms-stats-export-query';

describe('CMS statistics export snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks(); calls.access.mockResolvedValue(undefined); calls.aggregate.mockReturnValue(sql`with metrics as (select 1)`);
    calls.transaction.mockImplementation(async (fn: (tx: { execute: typeof calls.execute }) => Promise<void>) => {
      calls.active = true;
      try { await fn({ execute: calls.execute }); } finally { calls.active = false; }
    });
  });
  it('validates filters/permissions before queueing and freezes a reusable cutoff/version', async () => {
    const query = await prepareCmsStatisticsExportQuery({ siteId: 4, timeZone: 'Asia/Shanghai', dimension: 'author', author: '李清' });
    expect(query).toMatchObject({ siteId: 4, dimension: 'author', author: '李清', reportVersion: CMS_STAT_REPORT_VERSION });
    expect(query.watermark).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(calls.access).toHaveBeenCalledWith(4);
    expect(await prepareCmsStatisticsExportQuery(query)).toEqual(query);
    expect(calls.aggregate).not.toHaveBeenCalled();
    await expect(prepareCmsStatisticsExportQuery({ siteId: 4, sortBy: 'pv;drop table user_events' })).rejects.toMatchObject({ status: 400 });
    calls.access.mockRejectedValueOnce(new Error('无站点权限'));
    await expect(prepareCmsStatisticsExportQuery({ siteId: 5 })).rejects.toThrow('无站点权限');
  });
  it('aggregates/counts once and consumes every batch before the repeatable-read transaction closes', async () => {
    const dialect = new PgDialect(); const statements: string[] = []; let fetches = 0;
    calls.execute.mockImplementation(async (query) => {
      expect(calls.active).toBe(true);
      const statement = dialect.sqlToQuery(query).sql; statements.push(statement);
      if (statement.includes('count(*)')) return [{ total: 2 }];
      if (statement.startsWith('select *')) return ++fetches === 1 ? [{ __row: 1, key: 'a', label: 'A', pv: 3 }] : fetches === 2 ? [{ __row: 2, key: 'b', label: 'B', pv: 2 }] : [];
      return [];
    });
    const rows: unknown[] = [];
    await withCmsStatisticsExportSnapshot({ siteId: 4, dimension: 'author', sortBy: 'pv' }, async (stream, total) => {
      expect(total).toBe(2);
      for await (const row of stream) { expect(calls.active).toBe(true); rows.push(row); }
    });
    expect(rows).toMatchObject([{ key: 'a', pv: 3 }, { key: 'b', pv: 2 }]);
    expect(calls.aggregate).toHaveBeenCalledTimes(1);
    expect(statements.filter(value => value.includes('count(*)'))).toHaveLength(1);
    expect(statements[0]).toContain('on commit drop');
    expect(statements.filter(value => value.startsWith('select *')).every(value => !value.includes('offset'))).toBe(true);
    expect(calls.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'repeatable read' });
    expect(calls.active).toBe(false);
  });
  it('propagates cancellation through the transaction instead of committing a partial report', async () => {
    calls.execute.mockResolvedValue([{ total: 2 }]);
    await expect(withCmsStatisticsExportSnapshot({ siteId: 4 }, async () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
    expect(calls.active).toBe(false);
  });
});
