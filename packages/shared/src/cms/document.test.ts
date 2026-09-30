import { describe, expect, it } from 'vitest';
import { cmsDocumentAnchorSchema, cmsDocumentAnchorStatus, diffCmsDocumentBlocks, reconcileCmsDocumentIdentities, type CmsBodyDocument, type CmsDocumentNode } from './document';

const paragraph = (id: string, text: string): CmsDocumentNode => ({ id, kind: 'element', tag: 'p', attributes: {}, children: [{ id: `${id}-text`, kind: 'text', text }] });
const document = (...nodes: CmsDocumentNode[]): CmsBodyDocument => ({ schemaVersion: 1, nodes });

describe('CMS paragraph identities and review anchors', () => {
  it('preserves existing paragraph identities when a new paragraph is inserted before them', () => {
    const before = document(paragraph('one', 'First'), paragraph('two', 'Second'));
    const after = reconcileCmsDocumentIdentities(document(paragraph('new', 'Introduction'), paragraph('a', 'First'), paragraph('b', 'Second')), before);
    expect(after.nodes.map((node) => node.id)).toEqual(['new', 'one', 'two']);
    expect(diffCmsDocumentBlocks(before, after)).toEqual([{ id: 'new', kind: 'added', before: '', after: 'Introduction', beforeIndex: null, afterIndex: 0 }]);
  });

  it('retains a paragraph anchor through a move and reports later edits or deletion', () => {
    const before = document(paragraph('one', '你好😀，请核对金额'), paragraph('two', 'Other'));
    const anchor = cmsDocumentAnchorSchema.parse({ nodeId: 'one', quote: '😀', startOffset: 2, endOffset: 4 });
    const moved = reconcileCmsDocumentIdentities(document(paragraph('a', 'Other'), paragraph('b', '你好😀，请核对金额')), before);
    expect(cmsDocumentAnchorStatus(moved, anchor)).toBe('current');
    const edited = reconcileCmsDocumentIdentities(document(paragraph('a', 'Other'), paragraph('b', '你好，金额已更新')), moved);
    expect(cmsDocumentAnchorStatus(edited, anchor)).toBe('changed');
    expect(cmsDocumentAnchorStatus(document(paragraph('two', 'Other')), anchor)).toBe('missing');
    expect(cmsDocumentAnchorSchema.safeParse({ ...anchor, endOffset: 6 }).success).toBe(false);
  });

  it('shows separate distant paragraph changes and identifies moves independently of text edits', () => {
    const before = document(paragraph('one', 'First'), paragraph('two', 'Unchanged'), paragraph('three', 'Last'));
    const after = reconcileCmsDocumentIdentities(document(paragraph('a', 'Updated first'), paragraph('b', 'Unchanged'), paragraph('c', 'Updated last')), before);
    expect(diffCmsDocumentBlocks(before, after).map((change) => [change.id, change.kind])).toEqual([['one', 'changed'], ['three', 'changed']]);
    const moved = reconcileCmsDocumentIdentities(document(paragraph('b', 'Unchanged'), paragraph('a', 'Updated first'), paragraph('c', 'Updated last')), after);
    expect(diffCmsDocumentBlocks(after, moved).map((change) => change.kind)).toEqual(['moved', 'moved']);
  });
});
