import { isPlainObject, stableStringify } from '../core/json';
import type { CmsContentRevisionSnapshot } from './content-revision';
import type { CmsModelField } from './contracts/models';
import type { CmsDocumentNode } from './document';

type TranslationContent = Partial<CmsContentRevisionSnapshot>;
type TranslationField = Pick<CmsModelField, 'name' | 'fieldType' | 'configuration'>;

const TEXT_FIELDS = [
  'title', 'subTitle', 'shortTitle', 'summary', 'author', 'source',
  'seoTitle', 'seoKeywords', 'seoDescription', 'socialImageAlt',
] as const satisfies readonly (keyof CmsContentRevisionSnapshot)[];

function normalizeValue(value: unknown): unknown {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  return value;
}

/** Node identities and resource URLs are editing/delivery details, not translation text. */
function documentText(node: CmsDocumentNode): unknown {
  if (node.kind === 'text') return { text: node.text };
  return {
    tag: node.tag,
    attributes: Object.fromEntries(['alt', 'title', 'aria-label'].flatMap((key) => node.attributes[key] ? [[key, node.attributes[key]]] : [])),
    children: node.children.map(documentText),
  };
}

function modelContent(values: Record<string, unknown>, fields?: readonly TranslationField[]): unknown {
  if (!fields) return normalizeValue(values);
  return Object.fromEntries(fields.flatMap((field) => {
    // Referenced objects and asset versions have their own update lifecycle.
    if (['image', 'file', 'reference', 'references'].includes(field.fieldType)) return [];
    const value = values[field.name];
    if (value == null || value === '') return [];
    let projected: unknown = normalizeValue(value);
    if (field.fieldType === 'object' && isPlainObject(value)) projected = modelContent(value, field.configuration?.fields);
    if (['array', 'blocks'].includes(field.fieldType) && Array.isArray(value)) {
      projected = value.map((item) => {
        if (!isPlainObject(item)) return normalizeValue(item);
        if (field.fieldType === 'blocks') {
          const block = field.configuration?.blockTypes?.find((candidate) => candidate.code === item.blockType);
          return { blockType: item.blockType, values: modelContent(item, block?.fields) };
        }
        return modelContent(item, field.configuration?.fields);
      });
    }
    return [[field.name, projected]];
  }));
}

/**
 * Translation baseline comparison only. Never use this projection as a revision integrity hash.
 * Compare the frozen source with its current working copy, not with its latest revision ID.
 * Model values include localizable business facts (numbers/dates/options), but not object/asset IDs.
 */
export function cmsTranslationContentKey(content: TranslationContent, fields?: readonly TranslationField[]): string {
  return stableStringify({
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, normalizeValue(content[key])])),
    body: content.bodyDocument ? content.bodyDocument.nodes.map(documentText) : normalizeValue(content.body),
    extend: modelContent(content.extend ?? {}, fields),
    captions: (content.mediaData?.images ?? []).map((image) => normalizeValue(image.caption)),
    attachments: (content.attachments ?? []).map((attachment) => normalizeValue(attachment.name)),
  });
}

export function cmsTranslationSourceChanged(
  source: TranslationContent,
  baseline: TranslationContent | null | undefined,
  sourceFields?: readonly TranslationField[],
  baselineFields: readonly TranslationField[] | undefined = sourceFields,
): boolean {
  return !baseline || cmsTranslationContentKey(source, sourceFields) !== cmsTranslationContentKey(baseline, baselineFields);
}
