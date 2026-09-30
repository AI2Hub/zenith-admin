import { afterEach, describe, expect, it } from 'vitest';
import { cmsTagContract, cmsVocabularyContract, type CmsTag, type CmsVocabulary } from '@zenith/shared/cms';
import { mockCmsContents, mockCmsContentVersions, mockCmsSites, mockCmsTags } from './data/cms';
import { resetMockCmsTaxonomy } from './data/cms-taxonomy';
import { cmsHandlers } from './handlers/cms';
import { cmsTaxonomyHandlers } from './handlers/cms-taxonomy';
import { resetMockCmsReleases } from './handlers/cms-releases';
import { activateMockCmsRevision, freezeMockCmsRevision, getMockCmsWorkingContent, resetMockCmsRevisions, saveMockCmsWorkingContent } from './utils/cms-revisions';
import { validateMockCmsTaxonomySelection } from './utils/cms-taxonomy';
import { MockHttpError } from './utils/contract';

const initial = { sites: structuredClone(mockCmsSites), tags: structuredClone(mockCmsTags), contents: structuredClone(mockCmsContents), revisions: structuredClone(mockCmsContentVersions) };
afterEach(() => {
  resetMockCmsTaxonomy(); resetMockCmsReleases(); resetMockCmsRevisions();
  mockCmsSites.splice(0, mockCmsSites.length, ...structuredClone(initial.sites));
  mockCmsTags.splice(0, mockCmsTags.length, ...structuredClone(initial.tags));
  mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents));
  mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.revisions));
});
async function call<T>(basePath: string, method: string, path: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${basePath}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const handler of [...cmsTaxonomyHandlers, ...cmsHandlers]) {
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `taxonomy-${crypto.randomUUID()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No taxonomy handler for ${path}`);
}
async function vocabulary(siteId: number, overrides: Record<string, unknown> = {}) {
  const response = await call<CmsVocabulary>(cmsVocabularyContract.basePath, 'POST', '/', { siteId, name: '行业', code: 'qa-industry', ...overrides });
  expect(response.status).toBe(200); return response.data;
}
async function term(siteId: number, vocabularyId: number, overrides: Record<string, unknown> = {}) {
  return call<CmsTag>(cmsTagContract.basePath, 'POST', '/', { siteId, vocabularyId, name: '工业', slug: 'qa-industrial', ...overrides });
}

describe('CMS taxonomy Demo lifecycle', () => {
  it('persists term hierarchy, aliases and localization while enforcing cycles and parent deletion guards', async () => {
    const siteId = initial.sites[0].id; const group = await vocabulary(siteId);
    const parent = await term(siteId, group.id, { aliases: ['制造业'], localeLabels: { en: 'Industry' } });
    const child = await term(siteId, group.id, { name: '设备制造', slug: 'qa-equipment', parentId: parent.data.id });
    expect(child.status).toBe(200);
    const patched = await call<CmsTag>(cmsTagContract.basePath, 'PUT', `/${parent.data.id}`, { name: '工业分类' });
    expect(patched.data).toMatchObject({ vocabularyId: group.id, aliases: ['制造业'], localeLabels: { en: 'Industry' } });
    expect((await call(cmsTagContract.basePath, 'PUT', `/${parent.data.id}`, { parentId: child.data.id })).status).toBe(400);
    expect((await call(cmsTagContract.basePath, 'DELETE', `/${parent.data.id}`)).status).toBe(409);
    expect((await call(cmsVocabularyContract.basePath, 'DELETE', `/${group.id}`)).status).toBe(409);
    const list = await call<{ list: CmsTag[] }>(cmsTagContract.basePath, 'GET', `/?siteId=${siteId}&vocabularyId=${group.id}`);
    expect(list.data.list.map(row => row.id).sort()).toEqual([parent.data.id, child.data.id].sort());
  });
  it('rejects a foreign-site vocabulary or parent before inserting a term', async () => {
    const siteId = initial.sites[0].id; const foreignSiteId = Math.max(...mockCmsSites.map(row => row.id)) + 1;
    mockCmsSites.push({ ...structuredClone(initial.sites[0]), id: foreignSiteId, code: 'qa-taxonomy-foreign' });
    const local = await vocabulary(siteId); const foreign = await vocabulary(foreignSiteId);
    const parent = await term(foreignSiteId, foreign.id);
    const count = mockCmsTags.length;
    expect((await term(siteId, foreign.id)).status).toBe(400);
    expect((await term(siteId, local.id, { parentId: parent.data.id })).status).toBe(400);
    expect(mockCmsTags).toHaveLength(count);
  });
  it('enforces draft applicability and selection limits, and keeps required classification for publication', async () => {
    const base = getMockCmsWorkingContent(initial.contents[0].id); const group = await vocabulary(base.siteId, { required: true, maxSelections: 1 });
    const first = await term(base.siteId, group.id); const second = await term(base.siteId, group.id, { name: '服务业', slug: 'qa-services' });
    const contentId = Math.max(...mockCmsContents.map(row => row.id)) + 1;
    mockCmsContents.push({ ...structuredClone(base), id: contentId, status: 'draft', editorialStatus: 'draft', tagIds: [], version: 1, publishedRevisionId: null, submittedRevisionId: null, approvedRevisionId: null, lockedAt: null });
    const content = getMockCmsWorkingContent(contentId);
    expect(() => validateMockCmsTaxonomySelection(content, false)).not.toThrow();
    expect(() => validateMockCmsTaxonomySelection(content, true)).toThrow(MockHttpError);
    expect(() => saveMockCmsWorkingContent(contentId, { tagIds: [first.data.id, second.data.id] }, content.version)).toThrow(MockHttpError);
    expect(content.tagIds).toEqual([]);
    saveMockCmsWorkingContent(contentId, { tagIds: [first.data.id] }, content.version);
    expect(() => validateMockCmsTaxonomySelection(content, true)).not.toThrow();
    activateMockCmsRevision(freezeMockCmsRevision(contentId, 'publication').id);
    saveMockCmsWorkingContent(contentId, { tagIds: [] }, content.version);
    expect((await call(cmsTagContract.basePath, 'DELETE', `/${first.data.id}`)).status).toBe(409);
  });
  it('protects free tags referenced by either a working copy or its older public revision without rewriting either', async () => {
    const base = getMockCmsWorkingContent(initial.contents[0].id);
    const created = await call<CmsTag>(cmsTagContract.basePath, 'POST', '/', { siteId: base.siteId, name: '自由标签', slug: 'qa-free-tag' });
    expect(created.status).toBe(200); expect(created.data.vocabularyId).toBeNull();
    const id = Math.max(...mockCmsContents.map(row => row.id)) + 1;
    mockCmsContents.push({ ...structuredClone(base), id, status: 'draft', editorialStatus: 'draft', tagIds: [], version: 1, publishedRevisionId: null, submittedRevisionId: null, approvedRevisionId: null, lockedAt: null });
    const content = saveMockCmsWorkingContent(id, { tagIds: [created.data.id] }, 1);
    const version = content.version;
    expect((await call(cmsTagContract.basePath, 'DELETE', `/${created.data.id}`)).status).toBe(409);
    expect(content.tagIds).toEqual([created.data.id]); expect(content.version).toBe(version);
    activateMockCmsRevision(freezeMockCmsRevision(id, 'publication').id);
    saveMockCmsWorkingContent(id, { tagIds: [] }, content.version);
    expect((await call(cmsTagContract.basePath, 'DELETE', `/${created.data.id}`)).status).toBe(409);
    expect(content.tagIds).toEqual([]);
    activateMockCmsRevision(freezeMockCmsRevision(id, 'publication').id);
    expect((await call(cmsTagContract.basePath, 'DELETE', `/${created.data.id}`)).status).toBe(200);
  });
  it('rejects a subtree move whose descendants exceed 12 levels and allows an exact-boundary move', async () => {
    const siteId = initial.sites[0].id; const group = await vocabulary(siteId);
    const start = Math.max(...mockCmsTags.map(row => row.id)) + 100;
    const make = (id: number, parentId: number | null): CmsTag => ({ id, siteId, vocabularyId: group.id, parentId, name: `层级 ${id}`, slug: `qa-level-${id}`, groupName: null, aliases: [], localeLabels: {}, contentCount: 0, createdAt: '2026-09-30 12:00:00', updatedAt: '2026-09-30 12:00:00' });
    mockCmsTags.push(...Array.from({ length: 10 }, (_, index) => make(start + index, index ? start + index - 1 : null)));
    const root = make(start + 20, null); const child = make(start + 21, root.id); const leaf = make(start + 22, child.id);
    mockCmsTags.push(root, child, leaf);
    expect((await call(cmsTagContract.basePath, 'PUT', `/${root.id}`, { parentId: start + 9 })).status).toBe(400);
    expect(root.parentId).toBeNull(); expect(child.parentId).toBe(root.id); expect(leaf.parentId).toBe(child.id);
    expect((await call(cmsTagContract.basePath, 'PUT', `/${root.id}`, { parentId: start + 8 })).status).toBe(200);
    expect(root.parentId).toBe(start + 8);
  });
});
