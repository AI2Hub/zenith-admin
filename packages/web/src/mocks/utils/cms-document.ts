import DOMPurify from 'dompurify';
import { CMS_DOCUMENT_TAGS, reconcileCmsDocumentIdentities, type CmsBodyDocument, type CmsDocumentNode } from '@zenith/shared/cms';

/** Demo uses the same stable identity reconciliation as the server, with the browser parser. */
export function normalizeMockCmsDocument(html: string, previous?: CmsBodyDocument | null): CmsBodyDocument {
  const dom = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html');
  const tags = new Set<string>(CMS_DOCUMENT_TAGS);
  let count = 0;
  const visit = (node: Node, depth: number): CmsDocumentNode[] => {
    if (++count > 20_000 || depth > 64) return [];
    if (node.nodeType === Node.TEXT_NODE) return [{ id: crypto.randomUUID(), kind: 'text', text: node.textContent ?? '' }];
    if (!(node instanceof Element) || !tags.has(node.tagName.toLowerCase())) return [];
    return [{ id: crypto.randomUUID(), kind: 'element', tag: node.tagName.toLowerCase() as (typeof CMS_DOCUMENT_TAGS)[number],
      attributes: Object.fromEntries(Array.from(node.attributes).map((attribute) => [attribute.name, attribute.value])),
      children: Array.from(node.childNodes).flatMap((child) => visit(child, depth + 1)) }];
  };
  return reconcileCmsDocumentIdentities({ schemaVersion: 1, nodes: Array.from(dom.body.childNodes).flatMap((node) => visit(node, 0)) }, previous);
}
