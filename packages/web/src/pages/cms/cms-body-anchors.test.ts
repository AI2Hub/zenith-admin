import { afterEach, describe, expect, it } from 'vitest';
import { captureCmsBodyAnchor, findCmsBodyAnchorElement } from './cms-body-anchors';
import type { CmsBodyDocument } from '@zenith/shared/cms';

afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });
const body: CmsBodyDocument = { schemaVersion: 1, nodes: [
  { id: 'p1', kind: 'element', tag: 'p', attributes: {}, children: [{ id: 't1', kind: 'text', text: '第一段原文' }] },
  { id: 'p2', kind: 'element', tag: 'p', attributes: {}, children: [{ id: 't2', kind: 'text', text: '第二段原文' }] },
] };

describe('CMS editor paragraph location', () => {
  it('captures a saved paragraph range without putting editorial IDs in HTML', () => {
    const root = document.createElement('div'); root.innerHTML = '<div contenteditable="true"><p>第一段原文</p><p>第二段原文</p></div>'; document.body.append(root);
    const paragraph = findCmsBodyAnchorElement(root, body, 'p2')!;
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 0); range.setEnd(paragraph.firstChild!, 3);
    window.getSelection()!.addRange(range);
    expect(captureCmsBodyAnchor(root, body)).toEqual({ nodeId: 'p2', quote: '第二段', startOffset: 0, endOffset: 3 });
    expect(root.innerHTML).not.toContain('p2');
  });
  it('refuses a selection spanning two paragraphs', () => {
    const root = document.createElement('div'); root.innerHTML = '<div contenteditable="true"><p>第一段原文</p><p>第二段原文</p></div>'; document.body.append(root);
    const paragraphs = root.querySelectorAll('p'); const range = document.createRange();
    range.setStart(paragraphs[0].firstChild!, 1); range.setEnd(paragraphs[1].firstChild!, 3); window.getSelection()!.addRange(range);
    expect(captureCmsBodyAnchor(root, body)).toBeNull();
  });
});
