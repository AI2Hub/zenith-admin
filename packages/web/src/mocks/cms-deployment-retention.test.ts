import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsDeploymentRetentionContract, cmsReleaseContract, type CmsRelease, type CmsDeploymentCapacityRow } from '@zenith/shared/cms';
import type { OutputOf } from '@zenith/shared/core';
import { asyncTaskContract, type AsyncTask } from '@zenith/shared/tasks';
import { urlOf } from '@/lib/contract-query';
import { cmsReleaseHandlers, resetMockCmsReleases } from './handlers/cms-releases';
import { cmsDeploymentRetentionHandlers, resetMockCmsDeploymentRetention } from './handlers/cms-deployment-retention';
import { asyncTasksHandlers } from './handlers/async-tasks';
import { getMockCmsWorkingContent, resetMockCmsRevisions } from './utils/cms-revisions';
import { mockCmsContents, mockCmsContentVersions, mockCmsPages } from './data/cms';

const initial = { contents: structuredClone(mockCmsContents), versions: structuredClone(mockCmsContentVersions), pages: structuredClone(mockCmsPages) };
function reset() { mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents)); mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.versions)); mockCmsPages.splice(0, mockCmsPages.length, ...structuredClone(initial.pages)); resetMockCmsRevisions(); resetMockCmsReleases(); resetMockCmsDeploymentRetention(); }
beforeEach(() => { reset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); reset(); });
async function call<T>(method: string, path: string, body?: unknown) {
  for (const handler of [...cmsDeploymentRetentionHandlers, ...cmsReleaseHandlers, ...asyncTasksHandlers]) {
    const request = new Request(new URL(path, window.location.origin), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await handler.run({ request, requestId: `retention-${Math.random()}` });
    if (result?.response) return { status: result.response.status, ...(await result.response.json() as { data: T }) };
  }
  throw new Error('No matching handler');
}
describe('CMS deployment capacity Demo lifecycle', () => {
  it('rejects stale cleanup previews, protects pins, resumes cancelled work and rejects purged rollback', async () => {
    const content = getMockCmsWorkingContent(1); const siteId = content.siteId;
    let active: number | null = null; const published: CmsRelease[] = [];
    for (let index = 0; index < 3; index++) {
      const release = await call<CmsRelease>('POST', urlOf(cmsReleaseContract.create), { siteId, name: `Retention ${index}`, revisionIds: [content.publishedRevisionId!] });
      await call('POST', urlOf(cmsReleaseContract.build, { params: { id: release.data.id } })); await vi.advanceTimersByTimeAsync(300);
      const activated: { status: number; data: CmsRelease } = await call<CmsRelease>('POST', urlOf(cmsReleaseContract.activate, { params: { id: release.data.id } }), { expectedGenerationId: active });
      active = activated.data.deploymentId; published.push(activated.data);
    }
    vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
    await call('PUT', urlOf(cmsDeploymentRetentionContract.savePolicy, { params: { id: siteId } }), { expectedVersion: 0, retainCount: 1, retainDays: 1, failedRetainDays: 0, automatic: false });
    const previewPath = urlOf(cmsDeploymentRetentionContract.preview, { params: { id: siteId } });
    const first = await call<OutputOf<typeof cmsDeploymentRetentionContract.preview>>('GET', previewPath);
    expect(first.data.candidates).toHaveLength(2); expect(first.data.candidates.some(row => row.id === active)).toBe(false);
    const pinned = first.data.candidates[0];
    await call('PUT', urlOf(cmsDeploymentRetentionContract.pin, { params: { id: pinned.id } }), { expectedVersion: pinned.version, pinned: true, reason: '验收保留' });
    const cleanupPath = urlOf(cmsDeploymentRetentionContract.cleanup, { params: { id: siteId } });
    expect((await call('POST', cleanupPath, { fingerprint: first.data.fingerprint, deploymentIds: first.data.candidates.map(row => row.id) })).status).toBe(409);
    const ready = await call<OutputOf<typeof cmsDeploymentRetentionContract.preview>>('GET', previewPath);
    expect(ready.data.candidates).toHaveLength(1);
    const target = ready.data.candidates[0];
    const submitted = await call<AsyncTask>('POST', cleanupPath, { fingerprint: ready.data.fingerprint, deploymentIds: [target.id] });
    await call('POST', urlOf(asyncTaskContract.cancel, { params: { id: submitted.data.id } }));
    // running 任务是协作式取消：轮询一次后 handler 才会退出并落为 cancelled，此时才允许断点恢复
    await call('GET', urlOf(asyncTaskContract.detail, { params: { id: submitted.data.id } }));
    await call('POST', urlOf(asyncTaskContract.resume, { params: { id: submitted.data.id } }));
    await vi.advanceTimersByTimeAsync(2500);
    await call('GET', urlOf(asyncTaskContract.detail, { params: { id: submitted.data.id } }));
    const list = await call<{ list: CmsDeploymentCapacityRow[] }>('GET', urlOf(cmsDeploymentRetentionContract.list, { query: { siteId } }));
    expect(list.data.list.find(row => row.id === target.id)?.storageState).toBe('purged');
    expect(list.data.list.find(row => row.id === pinned.id)?.storageState).toBe('available');
    const release = published.find(row => row.deploymentId === target.id)!;
    expect((await call('POST', urlOf(cmsReleaseContract.rollback, { params: { id: release.id } }), { expectedGenerationId: active })).status).toBe(409);
  });
});
