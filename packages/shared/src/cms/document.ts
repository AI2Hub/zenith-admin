import * as z from 'zod';
import { escapeHtml } from '../core/text';
import { lazyRecursive } from '../core/validation';

export const CMS_DOCUMENT_TAGS = ['p', 'br', 'hr', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'img', 'figure', 'figcaption', 'video', 'audio', 'source'] as const;
const textNodeSchema = z.object({ id: z.string().min(1).max(100), kind: z.literal('text'), text: z.string().max(2_000_000) });
const elementFieldsSchema = z.object({
  id: z.string().min(1).max(100), kind: z.literal('element'), tag: z.enum(CMS_DOCUMENT_TAGS),
  attributes: z.record(z.string().max(100), z.string().max(10_000)),
});
export type CmsDocumentNode = z.infer<typeof textNodeSchema> | (z.infer<typeof elementFieldsSchema> & { children: CmsDocumentNode[] });
export const cmsDocumentNodeSchema: z.ZodType<CmsDocumentNode> = lazyRecursive(() => z.union([
  textNodeSchema,
  elementFieldsSchema.extend({ children: z.array(cmsDocumentNodeSchema).max(10_000) }),
])).meta({ id: 'CmsDocumentNode' });
export const cmsBodyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(cmsDocumentNodeSchema).max(10_000),
}).meta({ id: 'CmsBodyDocument' });
export type CmsBodyDocument = z.infer<typeof cmsBodyDocumentSchema>;

/** Offsets use JavaScript UTF-16 units, matching editor Range offsets and String.slice. */
export const cmsDocumentAnchorSchema = z.object({
  nodeId: z.string().min(1).max(100), quote: z.string().min(1).max(2000),
  startOffset: z.int().min(0).max(2_000_000), endOffset: z.int().min(1).max(2_000_000),
}).refine((anchor) => anchor.endOffset > anchor.startOffset && anchor.endOffset - anchor.startOffset === anchor.quote.length && !!anchor.quote.trim(), '批注文本范围无效').meta({ id: 'CmsDocumentAnchor' });
export type CmsDocumentAnchor = z.infer<typeof cmsDocumentAnchorSchema>;

export function cmsDocumentNodeText(node: CmsDocumentNode): string {
  return node.kind === 'text' ? node.text : node.children.map(cmsDocumentNodeText).join('');
}

export function findCmsDocumentNode(document: CmsBodyDocument | null | undefined, nodeId: string): CmsDocumentNode | undefined {
  const find = (nodes: CmsDocumentNode[]): CmsDocumentNode | undefined => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.kind === 'element') { const match = find(node.children); if (match) return match; }
    }
    return undefined;
  };
  return document ? find(document.nodes) : undefined;
}

const annotationTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'figcaption', 'td', 'th']);
export function cmsDocumentBlocks(document: CmsBodyDocument | null | undefined): { id: string; tag: string; text: string; html: string }[] {
  const blocks: { id: string; tag: string; text: string; html: string }[] = [];
  const visit = (node: CmsDocumentNode) => {
    if (node.kind !== 'element') return;
    const text = cmsDocumentNodeText(node);
    if (annotationTags.has(node.tag) && text.trim()) blocks.push({ id: node.id, tag: node.tag, text, html: serializeCmsBodyDocument({ schemaVersion: 1, nodes: [node] }) });
    else node.children.forEach(visit);
  };
  document?.nodes.forEach(visit);
  return blocks;
}

export function cmsDocumentAnchorStatus(document: CmsBodyDocument | null | undefined, anchor: CmsDocumentAnchor | null | undefined): 'current' | 'changed' | 'missing' | null {
  if (!anchor) return null;
  const node = findCmsDocumentNode(document, anchor.nodeId);
  if (!node) return 'missing';
  return cmsDocumentNodeText(node).slice(anchor.startOffset, anchor.endOffset) === anchor.quote ? 'current' : 'changed';
}

/** Reserve unchanged identities before positional fallbacks, so insertions cannot steal moved IDs. */
export function reconcileCmsDocumentIdentities(document: CmsBodyDocument, previous?: CmsBodyDocument | null): CmsBodyDocument {
  const signatures = new WeakMap<CmsDocumentNode, string>();
  const signature = (node: CmsDocumentNode): string => {
    const cached = signatures.get(node); if (cached) return cached;
    const result = node.kind === 'text' ? `text:${node.text}` : `${node.tag}:${JSON.stringify(node.attributes)}:${node.children.map(signature).join('|')}`;
    signatures.set(node, result); return result;
  };
  const flatten = (nodes: CmsDocumentNode[], prefix = ''): { node: CmsDocumentNode; path: string }[] => nodes.flatMap((node, index) => {
    const path = `${prefix}.${index}`;
    return [{ node, path }, ...(node.kind === 'element' ? flatten(node.children, path) : [])];
  });
  const before = flatten(previous?.nodes ?? []);
  const next = flatten(document.nodes);
  const matches = new Map<string, CmsDocumentNode[]>();
  const positions = new Map(before.map((item) => [item.path, item.node]));
  for (const { node } of before) { const key = signature(node); const group = matches.get(key) ?? []; group.push(node); matches.set(key, group); }
  const used = new Set<string>(); const matched = new Set<CmsDocumentNode>();
  for (const { node } of next) {
    const candidates = matches.get(signature(node));
    let exact = candidates?.shift();
    while (exact && used.has(exact.id)) exact = candidates?.shift();
    if (exact) { node.id = exact.id; used.add(exact.id); matched.add(node); }
  }
  for (const { node, path } of next) {
    if (matched.has(node)) continue;
    const prior = positions.get(path);
    if (prior && !used.has(prior.id) && prior.kind === node.kind && (prior.kind === 'text' || (node.kind === 'element' && prior.tag === node.tag))) node.id = prior.id;
    if (used.has(node.id)) node.id = crypto.randomUUID();
    used.add(node.id);
  }
  return document;
}

export const cmsDocumentBlockDiffSchema = z.object({
  id: z.string(), kind: z.enum(['added', 'removed', 'changed', 'moved']), before: z.string(), after: z.string(), beforeIndex: z.int().nullable(), afterIndex: z.int().nullable(),
}).meta({ id: 'CmsDocumentBlockDiff' });
export type CmsDocumentBlockDiff = z.infer<typeof cmsDocumentBlockDiffSchema>;
export function diffCmsDocumentBlocks(before: CmsBodyDocument | null | undefined, after: CmsBodyDocument | null | undefined): CmsDocumentBlockDiff[] {
  const left = cmsDocumentBlocks(before); const right = cmsDocumentBlocks(after);
  const leftById = new Map(left.map((block, index) => [block.id, { block, index }]));
  const rightById = new Map(right.map((block, index) => [block.id, { block, index }]));
  const beforeOrder = new Map(left.filter((block) => rightById.has(block.id)).map((block, index) => [block.id, index]));
  const afterOrder = new Map(right.filter((block) => leftById.has(block.id)).map((block, index) => [block.id, index]));
  const changes: CmsDocumentBlockDiff[] = [];
  for (const [index, block] of right.entries()) {
    const prior = leftById.get(block.id);
    const kind = !prior ? 'added' : prior.block.html !== block.html ? 'changed' : beforeOrder.get(block.id) !== afterOrder.get(block.id) ? 'moved' : null;
    if (kind) changes.push({ id: block.id, kind, before: prior?.block.text ?? '', after: block.text, beforeIndex: prior?.index ?? null, afterIndex: index });
  }
  for (const [index, block] of left.entries()) if (!rightById.has(block.id)) changes.push({ id: block.id, kind: 'removed', before: block.text, after: '', beforeIndex: index, afterIndex: null });
  return changes;
}

const voidTags = new Set<string>(['br', 'hr', 'img', 'source']);
/** The server sanitizes this projection before storage; consumers never execute raw attributes. */
export function serializeCmsBodyDocument(document: CmsBodyDocument): string {
  const render = (node: CmsDocumentNode): string => {
    if (node.kind === 'text') return escapeHtml(node.text);
    const attributes = Object.entries(node.attributes)
      .filter(([key]) => /^[a-z][a-z0-9-]*$/.test(key) && !key.startsWith('on'))
      .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('');
    return `<${node.tag}${attributes}>${voidTags.has(node.tag) ? '' : `${node.children.map(render).join('')}</${node.tag}>`}`;
  };
  return document.nodes.map(render).join('');
}

export function cmsDocumentText(document: CmsBodyDocument): string {
  const text = (node: CmsDocumentNode): string => node.kind === 'text' ? node.text : `${node.children.map(text).join('')} `;
  return document.nodes.map(text).join('').trim();
}
