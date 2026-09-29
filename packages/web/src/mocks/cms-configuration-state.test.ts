import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsWorkbenchContract, cmsReleaseContract, type CmsConfigurationState, type CmsRelease } from '@zenith/shared/cms';
import { urlOf } from '@/lib/contract-query';
import { mockCmsContents, mockCmsContentVersions, mockCmsPages, mockCmsSites, mockCmsWidgets } from './data/cms';
import { mockAccessToken } from './utils/auth';
import { cmsConfigurationStateHandlers } from './handlers/cms-configuration-state';
import { cmsReleaseHandlers, resetMockCmsReleases, stageMockCmsConfigurationDraft } from './handlers/cms-releases';
import { resetMockCmsRevisions } from './utils/cms-revisions';

const initial = { sites: structuredClone(mockCmsSites), pages: structuredClone(mockCmsPages), widgets: structuredClone(mockCmsWidgets), contents: structuredClone(mockCmsContents), versions: structuredClone(mockCmsContentVersions) };
function reset() { mockCmsSites.splice(0, mockCmsSites.length, ...structuredClone(initial.sites)); mockCmsPages.splice(0, mockCmsPages.length, ...structuredClone(initial.pages)); mockCmsWidgets.splice(0, mockCmsWidgets.length, ...structuredClone(initial.widgets)); mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents)); mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.versions)); resetMockCmsRevisions(); resetMockCmsReleases(); }
beforeEach(() => { reset(); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); reset(); });
async function call<T>(method: string, path: string, body?: unknown) {
  for (const handler of [...cmsConfigurationStateHandlers, ...cmsReleaseHandlers]) {
    const request = new Request(new URL(path, window.location.origin), { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mockAccessToken('admin')}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await handler.run({ request, requestId: `config-state-${Math.random()}` });
    if (result?.response) return { status: result.response.status, ...(await result.response.json() as { data: T }) };
  }
  throw new Error('No handler');
}
describe('configuration state Demo parity', () => {
  it('tracks actual saved/page snapshot equality through publication and later unsent edits', async () => {
    const page = mockCmsPages[0]; const statePath = urlOf(cmsWorkbenchContract.configurationState, { query: { siteId: page.siteId, kind: 'page', objectId: page.id } });
    expect((await call<CmsConfigurationState>('GET', statePath)).data.state).toBe('saved');
    const created = await call<CmsRelease>('POST', urlOf(cmsReleaseContract.create), { siteId: page.siteId, name: '发布配置', includeSiteConfiguration: true });
    expect((await call<CmsConfigurationState>('GET', statePath)).data).toMatchObject({ state: 'pending', release: { id: created.data.id, matchesSaved: true } });
    await call('POST', urlOf(cmsReleaseContract.build, { params: { id: created.data.id } })); await vi.advanceTimersByTimeAsync(300);
    await call('POST', urlOf(cmsReleaseContract.activate, { params: { id: created.data.id } }), { expectedGenerationId: null });
    expect((await call<CmsConfigurationState>('GET', statePath)).data.state).toBe('online');
    page.name = '保存了新专题名称';
    expect((await call<CmsConfigurationState>('GET', statePath)).data.state).toBe('saved');
    stageMockCmsConfigurationDraft(page.siteId);
    expect((await call<CmsConfigurationState>('GET', statePath)).data.state).toBe('pending');
  });
});
