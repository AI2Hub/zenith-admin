import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { AnyNode } from 'domhandler';
import { CMS_DOCUMENT_TAGS, reconcileCmsDocumentIdentities, serializeCmsBodyDocument, type CmsBodyDocument, type CmsDocumentNode, type CmsFieldConfiguration } from '@zenith/shared/cms';
import { sanitizeCmsHtml } from './cms-html-sanitizer';

const require = createRequire(import.meta.url);
const tags = new Set<string>(CMS_DOCUMENT_TAGS);

/** HTML is an import boundary. Stored documents use a sanitized, editor-independent tree. */
export function normalizeCmsContentDocument(html: string, previous?: CmsBodyDocument): CmsBodyDocument {
  const { load } = require('cheerio') as typeof import('cheerio');
  const $ = load(sanitizeCmsHtml(html), {}, false);
  let count = 0;
  const walk = (node: AnyNode, depth: number): CmsDocumentNode[] => {
    if (++count > 20_000 || depth > 64) throw new Error('正文结构超过最大深度或节点数量');
    let result: CmsDocumentNode;
    if (node.type === 'text') result = { id: randomUUID(), kind: 'text', text: node.data };
    else if ('name' in node && 'children' in node && tags.has(node.name)) {
      result = { id: randomUUID(), kind: 'element', tag: node.name as (typeof CMS_DOCUMENT_TAGS)[number], attributes: { ...node.attribs },
        children: node.children.flatMap((child) => walk(child, depth + 1)) };
    } else return [];
    return [result];
  };
  const nodes = $.root().contents().toArray().flatMap((node) => walk(node, 0));
  return reconcileCmsDocumentIdentities({ schemaVersion: 1, nodes }, previous);
}

export function renderCmsContentDocument(document: CmsBodyDocument): string {
  return sanitizeCmsHtml(serializeCmsBodyDocument(document));
}

export function sanitizeCmsModelValues(fields: readonly { name: string; fieldType: string; configuration?: CmsFieldConfiguration | null }[], values: Record<string, unknown>): Record<string, unknown> {
  const result = { ...values };
  for (const field of fields) {
    const value = result[field.name];
    if (field.fieldType === 'richtext' && typeof value === 'string') result[field.name] = sanitizeCmsHtml(value);
    if (field.fieldType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) result[field.name] = sanitizeCmsModelValues(field.configuration?.fields ?? [], value as Record<string, unknown>);
    if (['array', 'blocks'].includes(field.fieldType) && Array.isArray(value)) result[field.name] = value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const children = field.fieldType === 'blocks' ? field.configuration?.blockTypes?.find((block) => block.code === item.blockType)?.fields : field.configuration?.fields;
      return sanitizeCmsModelValues(children ?? [], item);
    });
  }
  return result;
}
