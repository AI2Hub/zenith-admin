import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsDeliveryContract, type CmsDeliveryConfig, type CmsDeliveryRun, type CmsDeliveryRunSummary } from '@zenith/shared/cms';
import { urlOf } from '@/lib/contract-query';
import { cmsDeliveryHandlers, queueMockCmsDelivery, resetMockCmsDelivery } from './handlers/cms-delivery';
import { mockCmsSites } from './data/cms';

const siteId = mockCmsSites[0].id;
beforeEach(() => { resetMockCmsDelivery(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T04:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); resetMockCmsDelivery(); });
async function call<T>(method: string, path: string, body?: unknown) {
  for (const handler of cmsDeliveryHandlers) {
    const request = new Request(new URL(path, window.location.origin), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await handler.run({ request, requestId: `delivery-${Math.random()}` });
    if (result?.response) return { status: result.response.status, ...(await result.response.json() as { data: T }) };
  }
  throw new Error('No matching delivery handler');
}
const configPath = () => urlOf(cmsDeliveryContract.config, { query: { siteId } });
const detailPath = (id: number) => urlOf(cmsDeliveryContract.detail, { params: { id } });
const retryPath = (id: number) => urlOf(cmsDeliveryContract.retry, { params: { id } });

describe('CMS delivery Demo evidence', () => {
  it('rejects stale configuration writes, supersedes in-flight evidence and freezes new configuration on retry', async () => {
    const started = await call<CmsDeliveryRun>('POST', urlOf(cmsDeliveryContract.start), { siteId });
    expect(started.status).toBe(200);
    expect(started.data.configVersion).toBe(0);
    const values = { expectedVersion: 0, sourceBaseUrl: 'https://origin.example.com', publicBaseUrl: 'https://www.example.com', paths: ['/', '/news/'] };
    expect((await call<CmsDeliveryConfig>('PUT', configPath(), values)).data.version).toBe(1);
    expect((await call('PUT', configPath(), values)).status).toBe(409);
    expect((await call<CmsDeliveryConfig>('GET', configPath())).data.paths).toEqual(['/', '/news/']);
    const old = await call<CmsDeliveryRun>('GET', detailPath(started.data.id));
    expect(old.data.status).toBe('superseded');
    expect(old.data.configVersion).toBe(0);
    const retried = await call<CmsDeliveryRun>('POST', retryPath(old.data.id));
    expect(retried.data.configVersion).toBe(1);
    expect(retried.data.publicBaseUrl).toBe(values.publicBaseUrl);
    expect(retried.data.paths).toEqual(old.data.paths);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await call<CmsDeliveryRun>('GET', detailPath(old.data.id))).data.status).toBe('superseded');
    expect((await call<CmsDeliveryRun>('GET', detailPath(retried.data.id))).data.status).toBe('unverified');
  });

  it('rejects retries after visibility changes and never fabricates successful HTTP observations', async () => {
    const first = queueMockCmsDelivery(siteId, 'manual');
    const changed = queueMockCmsDelivery(siteId, 'withdraw', true);
    expect(changed.visibilityEpoch).toBe(first.visibilityEpoch + 1);
    expect((await call('POST', retryPath(first.id))).status).toBe(409);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await call<CmsDeliveryRun>('GET', detailPath(changed.id));
    expect(result.data.status).toBe('unverified');
    expect(result.data.purgeStatus).toBe('not_configured');
    expect(result.data.observations).toHaveLength(2);
    expect(result.data.observations.every(row => row.status === 'unverified' && row.httpStatus === null)).toBe(true);
    const list = await call<{ list: CmsDeliveryRunSummary[] }>('GET', urlOf(cmsDeliveryContract.list, { query: { siteId } }));
    expect(list.data.list).toHaveLength(2);
    expect(list.data.list[0]).not.toHaveProperty('observations');
    expect(list.data.list[0]).not.toHaveProperty('paths');
  });
});
