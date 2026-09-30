import { cmsDocumentBlocks, cmsDocumentNodeText, findCmsDocumentNode, type CmsBodyDocument, type CmsDocumentAnchor, type CmsDocumentNode } from '@zenith/shared/cms';

/** Locate from the saved tree; never inject editorial IDs into published HTML. */
export function findCmsBodyAnchorElement(root: HTMLElement, document: CmsBodyDocument | null | undefined, nodeId: string): HTMLElement | undefined {
  const node = findCmsDocumentNode(document, nodeId);
  if (!node || node.kind !== 'element') return undefined;
  const editor = root.querySelector<HTMLElement>('[contenteditable]');
  if (!editor) return undefined;
  const peers: CmsDocumentNode[] = [];
  const collect = (items: CmsDocumentNode[]) => items.forEach((item) => { if (item.kind === 'element') { if (item.tag === node.tag) peers.push(item); collect(item.children); } });
  collect(document?.nodes ?? []);
  const text = cmsDocumentNodeText(node);
  const sameText = peers.filter((item) => cmsDocumentNodeText(item) === text);
  const candidates = Array.from(editor.querySelectorAll<HTMLElement>(node.tag)).filter((element) => element.textContent === text);
  if (node.tag === 'img') return candidates.find((element) => element.getAttribute('src') === node.attributes.src && element.getAttribute('alt') === (node.attributes.alt ?? null)) ?? candidates[sameText.findIndex((item) => item.id === nodeId)];
  return candidates[sameText.findIndex((item) => item.id === nodeId)];
}

/** Capture a single saved paragraph's text range; selections crossing paragraphs are not anchors. */
export function captureCmsBodyAnchor(root: HTMLElement, document: CmsBodyDocument | null | undefined): CmsDocumentAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const quote = selection.toString();
  if (!quote.trim() || quote.length > 2000) return null;
  for (const block of cmsDocumentBlocks(document)) {
    const element = findCmsBodyAnchorElement(root, document, block.id);
    if (!element || !element.contains(range.startContainer) || !element.contains(range.endContainer)) continue;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset);
    const startOffset = prefix.toString().length;
    const endOffset = startOffset + quote.length;
    if (block.text.slice(startOffset, endOffset) !== quote) continue;
    return { nodeId: block.id, quote, startOffset, endOffset };
  }
  return null;
}
