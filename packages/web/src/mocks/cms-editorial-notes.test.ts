import { afterEach, describe, expect, it } from 'vitest';
import { cmsDocumentBlocks, cmsEditorialContract, type CmsEditorialNote, type CmsEditorialNoteReply } from '@zenith/shared/cms';
import { mockCmsContents, mockCmsContentVersions } from './data/cms';
import { cmsEditorialHandlers, resetMockCmsEditorialNotes } from './handlers/cms-editorial';
import { getMockCmsWorkingContent, resetMockCmsRevisions, saveMockCmsWorkingContent } from './utils/cms-revisions';

const initial = { contents: structuredClone(mockCmsContents), revisions: structuredClone(mockCmsContentVersions) };
afterEach(() => {
  resetMockCmsEditorialNotes(); resetMockCmsRevisions();
  mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents));
  mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.revisions));
});
async function call<T>(method: string, path: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${cmsEditorialContract.basePath}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const handler of cmsEditorialHandlers) {
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `notes-${crypto.randomUUID()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No notes handler for ${path}`);
}

describe('CMS review discussion Demo lifecycle', () => {
  it('rejects stale anchors, preserves valid anchors through insertions, and flags changed quotation text', async () => {
    const content = getMockCmsWorkingContent(1);
    saveMockCmsWorkingContent(1, { body: '<p>待核对的原文</p><p>其他段落</p>' }, content.version, 'autosave');
    const block = cmsDocumentBlocks(content.bodyDocument)[0];
    const anchor = { nodeId: block.id, quote: '待核对', startOffset: 0, endOffset: 3 };
    expect((await call('POST', '/1/notes', { message: '核对数据', fieldPath: 'body', anchor, expectedVersion: content.version - 1 })).status).toBe(409);
    const created = await call<CmsEditorialNote>('POST', '/1/notes', { message: '核对数据', fieldPath: 'body', anchor, expectedVersion: content.version });
    expect(created.data.anchorStatus).toBe('current');
    saveMockCmsWorkingContent(1, { body: '<p>新增摘要</p><p>待核对的原文</p><p>其他段落</p>' }, content.version, 'autosave');
    expect((await call<CmsEditorialNote[]>('GET', '/1/notes')).data[0].anchorStatus).toBe('current');
    saveMockCmsWorkingContent(1, { body: '<p>新增摘要</p><p>已核对的原文</p><p>其他段落</p>' }, content.version, 'autosave');
    expect((await call<CmsEditorialNote[]>('GET', '/1/notes')).data[0].anchorStatus).toBe('changed');
  });

  it('keeps replies in their content thread and requires reopening a resolved conversation', async () => {
    const note = (await call<CmsEditorialNote>('POST', '/1/notes', { message: '请确认标题', fieldPath: 'title' })).data;
    expect((await call('POST', `/2/notes/${note.id}/replies`, { message: '错误内容的回复' })).status).toBe(400);
    const reply = await call<CmsEditorialNoteReply>('POST', `/1/notes/${note.id}/replies`, { message: '已核对标题', mentionedUserIds: [2] });
    expect(reply.data.noteId).toBe(note.id);
    const solved = await call<CmsEditorialNote>('PUT', `/1/notes/${note.id}`, { resolved: true });
    expect(solved.data.resolvedBy).toBe(1);
    expect(solved.data.replies).toHaveLength(1);
    expect((await call('POST', `/1/notes/${note.id}/replies`, { message: '不可追加' })).status).toBe(409);
    await call('PUT', `/1/notes/${note.id}`, { resolved: false });
    expect((await call('POST', `/1/notes/${note.id}/replies`, { message: '重新讨论' })).status).toBe(200);
    expect((await call<CmsEditorialNote[]>('GET', '/1/notes')).data[0].replies).toHaveLength(2);
  });
});
