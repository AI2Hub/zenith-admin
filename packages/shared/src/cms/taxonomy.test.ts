import { describe, expect, it } from 'vitest';
import { cmsTermSubtreeHeight, cmsVocabularyApplies, createCmsVocabularySchema, inspectCmsTermHierarchy, updateCmsVocabularySchema, validateCmsVocabularySelection, type CmsTermHierarchyEntry } from './taxonomy';

const vocabulary = { id: 1, name: '行业', modelIds: [10], required: true, maxSelections: 1, status: 'enabled' };
describe('CMS controlled taxonomy', () => {
  it('requires controlled classifications at publication while permitting incomplete drafts', () => {
    expect(validateCmsVocabularySelection([vocabulary], [], 10, false)).toEqual([]);
    expect(validateCmsVocabularySelection([vocabulary], [], 10, true)).toEqual(['请选择「行业」分类']);
    expect(validateCmsVocabularySelection([vocabulary], [{ id: 1, vocabularyId: 1 }], 10, true)).toEqual([]);
  });
  it('rejects excessive, disabled, unknown and model-incompatible selections even for drafts', () => {
    expect(validateCmsVocabularySelection([vocabulary], [{ id: 1, vocabularyId: 1 }, { id: 2, vocabularyId: 1 }], 10, false)).toEqual(['「行业」最多选择 1 项']);
    expect(validateCmsVocabularySelection([vocabulary], [{ id: 1, vocabularyId: 1 }], 20, false)).toEqual(['分类词条 #1 不适用于当前内容模型']);
    expect(validateCmsVocabularySelection([{ ...vocabulary, status: 'disabled' }], [{ id: 1, vocabularyId: 1 }], 10, false)).toHaveLength(1);
    expect(validateCmsVocabularySelection([], [{ id: 1, vocabularyId: 99 }], 10, false)).toHaveLength(1);
  });
  it('retains free tags and applies unrestricted vocabularies across models', () => {
    expect(cmsVocabularyApplies({ modelIds: [] }, null)).toBe(true);
    expect(cmsVocabularyApplies(vocabulary, null)).toBe(false);
    expect(validateCmsVocabularySelection([vocabulary], [{ id: 2, vocabularyId: null }], 20, true)).toEqual([]);
  });
  it('preserves omitted update fields without resetting defaults or moving ownership', () => {
    expect(createCmsVocabularySchema.parse({ siteId: 1, name: ' 行业 ', code: 'industry' })).toMatchObject({ name: '行业', required: false, modelIds: [], maxSelections: 10 });
    expect(updateCmsVocabularySchema.parse({ name: '产业', siteId: 2 })).toEqual({ name: '产业' });
  });
  it('enforces the same 12-level boundary for a new term and an existing term', async () => {
    const entries: CmsTermHierarchyEntry[] = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, siteId: 1, vocabularyId: 1, parentId: index || null }));
    const resolve = async (id: number) => entries.find(term => term.id === id) ?? null;
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 11 }, undefined, resolve)).toBeNull();
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 11 }, 99, resolve)).toBeNull();
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 12 }, undefined, resolve)).toContain('12');
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 12 }, 99, resolve)).toContain('12');
  });
  it('rejects cycles and cross-vocabulary or cross-site ancestors', async () => {
    const resolve = async (id: number): Promise<CmsTermHierarchyEntry> => ({ id, siteId: 1, vocabularyId: 1, parentId: id === 2 ? 1 : null });
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 2 }, 1, resolve)).toContain('循环');
    expect(await inspectCmsTermHierarchy(2, { vocabularyId: 1, parentId: 2 }, undefined, resolve)).toContain('不属于本站');
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 2, parentId: 2 }, undefined, resolve)).toContain('同一受控词表');
  });
  it('includes the entire moving subtree in the depth limit', async () => {
    const ancestors: CmsTermHierarchyEntry[] = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, siteId: 1, vocabularyId: 1, parentId: index || null }));
    const subtree: CmsTermHierarchyEntry[] = [{ id: 90, siteId: 1, vocabularyId: 1, parentId: null }, { id: 91, siteId: 1, vocabularyId: 1, parentId: 90 }, { id: 92, siteId: 1, vocabularyId: 1, parentId: 91 }];
    const terms = [...ancestors, ...subtree];
    const height = cmsTermSubtreeHeight(90, terms); expect(height).toBe(3);
    const resolve = async (id: number) => terms.find(term => term.id === id);
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 9 }, 90, resolve, height)).toBeNull();
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 10 }, 90, resolve, height)).toContain('12');
    expect(await inspectCmsTermHierarchy(1, { vocabularyId: 1, parentId: 11 }, 90, resolve)).toBeNull();
  });
  it('terminates if a malformed stored subtree contains a cycle', () => {
    expect(cmsTermSubtreeHeight(1, [{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }])).toBe(Infinity);
  });
});
