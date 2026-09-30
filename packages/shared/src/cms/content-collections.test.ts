import { describe, expect, it } from 'vitest';
import { cmsCollectionDefinitionSchema, selectCmsCollectionCandidates, validateCmsCollectionFieldRules, type CmsCollectionCandidate } from './content-collections';

const row = (id: number, values: Partial<CmsCollectionCandidate> = {}): CmsCollectionCandidate => ({ id, title: `文章 ${id}`, modelId: 1, channelId: 10, locale: 'zh-CN', contentType: 'article', tagIds: [], publishedAt: '2026-09-30T00:00:00Z', extend: {}, ...values });
const fields = [{ name: 'price', fieldType: 'number' as const }, { name: 'visible', fieldType: 'switch' as const }];

describe('CMS content collection rules', () => {
  it('rejects ambiguous definition input and incompatible published-model rules', () => {
    expect(cmsCollectionDefinitionSchema.safeParse({ filters: [{ field: 'price', op: 'gte', value: 10 }] }).success).toBe(false);
    expect(cmsCollectionDefinitionSchema.safeParse({ pinnedIds: [1, 1] }).success).toBe(false);
    expect(cmsCollectionDefinitionSchema.safeParse({ pinnedIds: [1], excludedIds: [1] }).success).toBe(false);
    const invalid = cmsCollectionDefinitionSchema.parse({ modelId: 1, sort: 'field', sortField: 'missing', filters: [{ field: 'price', op: 'gte', value: '10' }, { field: 'visible', op: 'gte', value: true }] });
    expect(validateCmsCollectionFieldRules(invalid, fields)).toHaveLength(3);
  });
  it('orders numeric values numerically with stable ties and missing values last', () => {
    const rows = [row(1, { extend: { price: 10 } }), row(2, { extend: { price: 2 } }), row(3, { extend: { price: '3' } }), row(4, { extend: { price: 2 } })];
    const definition = cmsCollectionDefinitionSchema.parse({ modelId: 1, sort: 'field', sortField: 'price', direction: 'asc' });
    expect(selectCmsCollectionCandidates(rows, definition, fields).map(item => item.id)).toEqual([4, 2, 1, 3]);
    expect(selectCmsCollectionCandidates(rows, { ...definition, direction: 'desc' }, fields).map(item => item.id)).toEqual([1, 4, 2, 3]);
  });
  it('requires all tags and filters, without coercing malformed values', () => {
    const definition = cmsCollectionDefinitionSchema.parse({ modelId: 1, tagIds: [1, 2], locale: 'zh-CN', filters: [{ field: 'price', op: 'gte', value: 2 }, { field: 'visible', op: 'eq', value: true }] });
    const rows = [row(1, { tagIds: [1, 2], extend: { price: 10, visible: true } }), row(2, { tagIds: [1], extend: { price: 10, visible: true } }), row(3, { tagIds: [1, 2], extend: { price: '10', visible: true } }), row(4, { tagIds: [1, 2], extend: { price: 10, visible: false } })];
    expect(selectCmsCollectionCandidates(rows, definition, fields).map(item => item.id)).toEqual([1]);
  });
  it('preserves manual pin order without restoring ineligible or excluded rows, and enforces consumer limits', () => {
    const definition = cmsCollectionDefinitionSchema.parse({ modelId: 1, pinnedIds: [7, 99, 3], excludedIds: [4], limit: 3 });
    const rows = [row(1), row(3, { modelId: 9, locale: 'en-US' }), row(4), row(7, { modelId: 9 }), row(8)];
    expect(selectCmsCollectionCandidates(rows, definition, fields).map(item => item.id)).toEqual([7, 3, 8]);
    expect(selectCmsCollectionCandidates(rows, definition, fields, 1).map(item => item.id)).toEqual([7]);
    expect(selectCmsCollectionCandidates(rows, definition, fields, 0)).toEqual([]);
  });
});
