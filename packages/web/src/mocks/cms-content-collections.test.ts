import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsContentCollectionContract, type CmsContentCollection, type CmsContent, type CmsModelField } from '@zenith/shared/cms';
import { mockCmsChannels, mockCmsContents, mockCmsContentVersions, mockCmsModels, mockCmsPages, mockCmsSites } from './data/cms';
import { resetMockCmsContentCollections } from './data/cms-content-collections';
import { cmsContentCollectionHandlers, previewMockCmsCollection } from './handlers/cms-content-collections';
import { publishMockCmsModelVersion, resetMockCmsModelVersions } from './handlers/cms-editorial';
import { resetMockCmsReleases } from './handlers/cms-releases';
import { activateMockCmsRevision, freezeMockCmsRevision, getMockCmsWorkingContent, resetMockCmsRevisions, saveMockCmsWorkingContent } from './utils/cms-revisions';

const initial = { channels: structuredClone(mockCmsChannels), contents: structuredClone(mockCmsContents), revisions: structuredClone(mockCmsContentVersions), models: structuredClone(mockCmsModels), pages: structuredClone(mockCmsPages), sites: structuredClone(mockCmsSites) };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-30T04:00:00Z')); });
afterEach(() => {
  resetMockCmsContentCollections(); resetMockCmsReleases(); resetMockCmsRevisions(); resetMockCmsModelVersions();
  mockCmsChannels.splice(0, mockCmsChannels.length, ...structuredClone(initial.channels));
  mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents));
  mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.revisions));
  mockCmsModels.splice(0, mockCmsModels.length, ...structuredClone(initial.models));
  mockCmsPages.splice(0, mockCmsPages.length, ...structuredClone(initial.pages));
  mockCmsSites.splice(0, mockCmsSites.length, ...structuredClone(initial.sites)); vi.useRealTimers();
});
async function call<T>(method: string, path: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${cmsContentCollectionContract.basePath}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const handler of cmsContentCollectionHandlers) {
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `collection-${crypto.randomUUID()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No collection handler for ${path}`);
}
function publishedContent(values: Partial<CmsContent> = {}) {
  const base = getMockCmsWorkingContent(initial.contents[0].id);
  const id = Math.max(...mockCmsContents.map(row => row.id)) + 1;
  mockCmsContents.push({ ...structuredClone(base), id, title: `QA集合文章 ${id}`, modelId: null, tagIds: [], status: 'draft', editorialStatus: 'draft', version: 1, publishedRevisionId: null, submittedRevisionId: null, approvedRevisionId: null, lockedAt: null, archivedAt: null, expireAt: null, ...values });
  activateMockCmsRevision(freezeMockCmsRevision(id, 'publication').id); return getMockCmsWorkingContent(id);
}

describe('CMS content collection Demo', () => {
  it('pins model versions, uses numeric ordering, and previews published content instead of later drafts', async () => {
    const siteId = initial.contents[0].siteId;
    const modelId = Math.max(...mockCmsModels.map(row => row.id)) + 1;
    const field: CmsModelField = { id: 98765, modelId, name: 'price', label: '价格', fieldType: 'number', required: false, searchable: false, showInList: false, showInDetail: false,
      detailGroup: null, detailSort: 0, placeholder: null, defaultValue: null, optionSource: 'manual', dictCode: null, options: null, sort: 0, createdAt: '2026-09-30 12:00:00', updatedAt: '2026-09-30 12:00:00' };
    mockCmsModels.push({ ...initial.models[0], id: modelId, ownerSiteId: siteId, fields: [field], publishedVersionId: null });
    const publishedModel = await publishMockCmsModelVersion(modelId);
    const first = publishedContent({ modelId, extend: { price: 2 } }); const second = publishedContent({ modelId, extend: { price: 10 } });
    const created = await call<CmsContentCollection>('POST', '/', { siteId, name: '价格排序', code: 'qa-price', definition: { modelId, modelVersionId: 999999, sort: 'field', sortField: 'price', direction: 'asc' } });
    expect(created.status).toBe(200); expect(created.data.definition.modelVersionId).toBe(publishedModel.publishedVersionId);
    expect(previewMockCmsCollection(created.data.id).items.map(row => row.id)).toEqual([first.id, second.id]);
    const publishedTitle = first.title;
    saveMockCmsWorkingContent(first.id, { title: '未发布标题' }, first.version);
    expect(previewMockCmsCollection(created.data.id).items[0].title).toBe(publishedTitle);
    const model = mockCmsModels.find(row => row.id === modelId)!; model.fields = [{ ...field, fieldType: 'text' }]; await publishMockCmsModelVersion(modelId);
    expect(previewMockCmsCollection(created.data.id).items.map(row => row.id)).toEqual([first.id, second.id]);
  });
  it('retains immutable definition history, rejects stale updates, and prevents deletion while referenced', async () => {
    const siteId = initial.sites[0].id;
    const created = await call<CmsContentCollection>('POST', '/', { siteId, name: '动态集合', code: 'qa-dynamic', definition: { limit: 5 } });
    expect(created.status).toBe(200);
    const updated = await call<CmsContentCollection>('PUT', `/${created.data.id}`, { expectedVersion: 1, name: '新版集合', definition: { limit: 7 } });
    expect(updated.data.version).toBe(2);
    expect((await call('PUT', `/${created.data.id}`, { expectedVersion: 1, name: '过期修改' })).status).toBe(409);
    const versions = await call<{ version: number; definition: { limit: number } }[]>('GET', `/${created.data.id}/versions`);
    expect(versions.data.map(row => [row.version, row.definition.limit])).toEqual([[2, 7], [1, 5]]);
    const site = mockCmsSites.find(row => row.id === siteId)!; site.settings = { ...site.settings, themeConfig: { homeSections: [{ collectionId: created.data.id }] } };
    expect((await call('DELETE', `/${created.data.id}`)).status).toBe(409);
  });
  it('keeps expiry and channel visibility ahead of manual pins and rejects foreign-site references', async () => {
    const live = publishedContent(); const expired = publishedContent({ expireAt: '2026-01-01 00:00:00' }); const hidden = publishedContent();
    const channel = mockCmsChannels.find(row => row.id === hidden.channelId)!;
    const hiddenChannelId = Math.max(...mockCmsChannels.map(row => row.id)) + 1;
    mockCmsChannels.push({ ...channel, id: hiddenChannelId, status: 'disabled' });
    saveMockCmsWorkingContent(hidden.id, { channelId: hiddenChannelId }, hidden.version); activateMockCmsRevision(freezeMockCmsRevision(hidden.id, 'publication').id);
    const created = await call<CmsContentCollection>('POST', '/', { siteId: live.siteId, name: '固定集合', code: 'qa-pinned', definition: { pinnedIds: [expired.id, hidden.id, live.id], limit: 1 } });
    expect(previewMockCmsCollection(created.data.id).items.map(row => row.id)).toEqual([live.id]);
    const foreignChannelId = hiddenChannelId + 1; mockCmsChannels.push({ ...channel, id: foreignChannelId, siteId: live.siteId + 999 });
    expect((await call('POST', '/', { siteId: live.siteId, name: '错误集合', code: 'qa-foreign', definition: { channelIds: [foreignChannelId] } })).status).toBe(400);
  });
});
