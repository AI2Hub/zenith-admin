import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportJobContract, type ExportJob, type ExportJobCreateResult } from '@zenith/shared/tasks';
import { cmsStatReportQuery } from '@zenith/shared/cms';
import { urlOf } from '@/lib/contract-query';
import { exportJobsHandlers } from './handlers/export-jobs';
import { getMockCmsStatsReportRows } from './handlers/cms-stats';
import { mockCmsContents } from './data/cms';

afterEach(() => vi.restoreAllMocks());
async function call(path: string, method = 'GET', body?: unknown) {
  const request = new Request(new URL(path, window.location.origin), { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  for (const handler of exportJobsHandlers) {
    const result = await handler.run({ request: request.clone(), requestId: `export-${Math.random()}` });
    if (result?.response) return result.response;
  }
  throw new Error('No export handler');
}

describe('CMS background report exports in Demo', () => {
  it('freezes the full filtered report, progresses without an open stats page and preserves repeat downloads', async () => {
    const query = { siteId: 1, dimension: 'content', sortBy: 'pv', sortOrder: 'desc' };
    const expected = getMockCmsStatsReportRows(cmsStatReportQuery.parse(query));
    const created = await call(urlOf(exportJobContract.create), 'POST', { entity: 'cms.statistics', format: 'csv', executionMode: 'sync', query });
    const { data } = await created.json() as { data: ExportJobCreateResult };
    expect(data.mode).toBe('async'); expect(data.job.totalRows).toBe(expected.length);
    expect(data.job.query).toMatchObject({ reportVersion: 'cms-events-v2.attribution-v1', timeZone: 'Asia/Shanghai' });
    expect(data.job.query.watermark).toBeTruthy();
    const source = mockCmsContents.find(row => String(row.id) === expected[0].key)!;
    const original = source.title; source.title = 'changed after export snapshot';
    try {
      const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 4000);
      const detail = await call(urlOf(exportJobContract.detail, { params: { id: data.job.id } }));
      const job = (await detail.json() as { data: ExportJob }).data;
      expect(job).toMatchObject({ status: 'success', processedRows: expected.length, rowCount: expected.length });
      const path = urlOf(exportJobContract.download, { params: { id: job.id } });
      const first = await (await call(path)).text(); const second = await (await call(path)).text();
      expect(first).toEqual(second); expect(first).toContain(original); expect(first).not.toContain(source.title);
      expect(first.trim().split('\r\n')).toHaveLength(expected.length + 1);
    } finally { source.title = original; }
  });
  it('keeps cancellation terminal and rejects invalid filters rather than exporting an unscoped report', async () => {
    const response = await call(urlOf(exportJobContract.create), 'POST', { entity: 'cms.statistics', format: 'csv', query: { siteId: 1, dimension: 'search', keyword: '文化选题 26' } });
    const created = (await response.json() as { data: ExportJobCreateResult }).data;
    expect(created.job.totalRows).toBe(1);
    await call(urlOf(exportJobContract.cancel, { params: { id: created.job.id } }), 'POST');
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 4000);
    const detail = (await (await call(urlOf(exportJobContract.detail, { params: { id: created.job.id } }))).json() as { data: ExportJob }).data;
    expect(detail.status).toBe('cancelled');
    expect((await call(urlOf(exportJobContract.download, { params: { id: created.job.id } }))).status).toBe(400);
    expect((await call(urlOf(exportJobContract.create), 'POST', { entity: 'cms.statistics', format: 'csv', query: { dimension: 'content' } })).status).toBe(400);
  });
});
