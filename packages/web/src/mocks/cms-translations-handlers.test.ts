import { afterEach, describe, expect, it } from 'vitest';
import { cmsEditorialContract, type CmsContent } from '@zenith/shared/cms';
import type { OutputOf } from '@zenith/shared/core';
import { mockCmsContents, mockCmsContentVersions } from './data/cms';
import { cmsEditorialHandlers } from './handlers/cms-editorial';
import { freezeMockCmsRevision, getMockCmsRevision, getMockCmsWorkingContent, resetMockCmsRevisions, saveMockCmsWorkingContent } from './utils/cms-revisions';

const initial = { contents: structuredClone(mockCmsContents), revisions: structuredClone(mockCmsContentVersions) };
afterEach(() => {
  resetMockCmsRevisions();
  mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents));
  mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.revisions));
});

async function call<T>(method: string, path: string, body?: unknown) {
  for (const handler of cmsEditorialHandlers) {
    const request = new Request(`${window.location.origin}${cmsEditorialContract.basePath}${path}`, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `translation-${Math.random()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No editorial handler for ${path}`);
}

type Variants = OutputOf<typeof cmsEditorialContract.translations>;
async function createTranslation(source: CmsContent, locale = 'en-US') {
  const result = await call<{ id: number }>('POST', `/${source.id}/translations`, { locale, channelId: source.channelId, title: 'Translation' });
  expect(result.status).toBe(200);
  return getMockCmsWorkingContent(result.data.id);
}

describe('CMS Demo translation baselines', () => {
  it('freezes the autosaved source and copies that exact baseline', async () => {
    const source = getMockCmsWorkingContent(1);
    saveMockCmsWorkingContent(source.id, { body: '<p>最新自动保存正文</p>', summary: '最新摘要' }, source.version, 'autosave');
    const translation = await createTranslation(source);
    const baseline = getMockCmsRevision(translation.sourceRevisionId!)!;
    expect(baseline.contentId).toBe(source.id);
    expect(baseline.sourceVersion).toBe(source.version);
    expect(baseline.snapshot.body).toBe('<p>最新自动保存正文</p>');
    expect(translation.body).toBe(baseline.snapshot.body);
    expect(translation.summary).toBe(baseline.snapshot.summary);
    expect((await call<Variants>('GET', `/${source.id}/translations`)).data.find((row) => row.id === translation.id)?.sourceChanged).toBe(false);
    expect((await call('POST', `/${source.id}/translations`, { locale: translation.locale, channelId: source.channelId, title: 'Duplicate' })).status).toBe(409);
  });

  it('ignores preview/checkpoint and operations, then flags a text-only autosave', async () => {
    const source = getMockCmsWorkingContent(1);
    const translation = await createTranslation(source);
    const changed = async () => (await call<Variants>('GET', `/${translation.id}/translations`)).data.find((row) => row.id === translation.id)?.sourceChanged;
    freezeMockCmsRevision(source.id, 'preview');
    freezeMockCmsRevision(source.id, 'checkpoint');
    saveMockCmsWorkingContent(source.id, { ownerId: 2, editor: '责任编辑', dueAt: '2026-10-10 10:00:00', isTop: true }, source.version, 'autosave');
    expect(await changed()).toBe(false);
    saveMockCmsWorkingContent(source.id, { summary: '需要重新翻译的摘要' }, source.version, 'autosave');
    expect(await changed()).toBe(true);
  });
});
