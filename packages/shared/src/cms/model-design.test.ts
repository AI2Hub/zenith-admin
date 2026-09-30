import { describe, expect, it } from 'vitest';
import { cmsNestedFieldDefinitionSchema, diffCmsFieldDefinitions, hasBreakingCmsFieldChanges, normalizeCmsFieldDefinitions, normalizeCmsStructuredValues, validateCmsFieldDefinitions, validateCmsStructuredFields, walkCmsStructuredValues, type CmsFieldDefinition } from './model-design';

describe('versioned content model validation', () => {
  it('allows incomplete drafts but requires publish fields', () => {
    const fields = [{ name: 'price', label: '价格', fieldType: 'number' as const, required: true }];
    expect(validateCmsStructuredFields(fields, {}, false)).toEqual([]);
    expect(validateCmsStructuredFields(fields, {}, true)[0].fieldPath).toBe('extend.price');
  });
  it('rejects unknown fields and disabled dictionary values', () => {
    const fields = [{ name: 'platform', label: '平台', fieldType: 'select' as const, resolvedOptions: [] }];
    expect(validateCmsStructuredFields(fields, { platform: 'old', hidden: 'value' }, false)).toHaveLength(2);
  });
  it('validates component instances at their own field paths', () => {
    const fields = [{ name: 'items', label: '规格', fieldType: 'array' as const, configuration: { fields: [{ name: 'name', label: '名称', fieldType: 'text' as const, required: true }] } }];
    expect(validateCmsStructuredFields(fields, { items: [{ _id: 'instance-1' }] }, true)[0].fieldPath).toBe('extend.items.0.name');
  });
  it('rejects non-finite numbers and out-of-range values', () => {
    const fields = [{ name: 'rating', label: '评分', fieldType: 'number' as const, configuration: { min: 0, max: 10 } }];
    expect(validateCmsStructuredFields(fields, { rating: Infinity }, true)).toHaveLength(1);
    expect(validateCmsStructuredFields(fields, { rating: 11 }, true)).toHaveLength(1);
  });

  it('preserves every nested field capability through the recursive contract', () => {
    const nested = { id: 'group-1', name: 'group', label: '分组', fieldType: 'object', configuration: { fields: [
      { id: 'choice-1', name: 'choice', label: '选项', fieldType: 'select', optionSource: 'dict', dictCode: 'platform', resolvedOptions: [{ label: '网页', value: 'web' }], defaultValue: 'web', searchable: true, placeholder: '请选择', configuration: { requiredWhen: { field: 'enabled', equals: true } } },
      { id: 'enabled-1', name: 'enabled', label: '启用', fieldType: 'switch', defaultValue: true },
    ] } };
    expect(cmsNestedFieldDefinitionSchema.parse(nested)).toEqual(nested);
  });

  it('adds defaults and instance identities once while preserving explicit empties and reordered instances', () => {
    const fields: CmsFieldDefinition[] = [{ name: 'items', label: '条目', fieldType: 'array', configuration: { fields: [
      { name: 'count', label: '数量', fieldType: 'number', defaultValue: 2 },
      { name: 'title', label: '标题', fieldType: 'text', defaultValue: '默认标题' },
    ] } }];
    const normalized = normalizeCmsStructuredValues(fields, { items: [{ title: '' }, { count: 0, title: null }] });
    const instances = normalized.items as Record<string, unknown>[];
    expect(instances[0]).toMatchObject({ title: '', count: 2, _id: expect.any(String) });
    expect(instances[1]).toMatchObject({ title: null, count: 0, _id: expect.any(String) });
    expect(instances[0]._id).not.toBe(instances[1]._id);
    expect(normalizeCmsStructuredValues(fields, { items: [...instances].reverse() }).items).toEqual([...instances].reverse());
    expect(validateCmsStructuredFields(fields, normalized, true)).toEqual([]);
  });

  it('rejects reused instance IDs and unsupported block types', () => {
    const fields: CmsFieldDefinition[] = [{ name: 'body', label: '正文', fieldType: 'blocks', configuration: { blockTypes: [{ code: 'text', label: '文字', fields: [{ name: 'text', label: '文字', fieldType: 'text' }] }] } }];
    const issues = validateCmsStructuredFields(fields, { body: [{ _id: 'same', blockType: 'text', text: 'hello' }, { _id: 'same', blockType: 'unknown' }] }, true);
    expect(issues.map(issue => issue.fieldPath)).toEqual(['extend.body.1._id', 'extend.body.1.blockType']);
  });

  it('retains nested definition identities and rejects sibling collisions and self conditions', () => {
    const fields: CmsFieldDefinition[] = [{ name: 'group', label: '分组', fieldType: 'object', configuration: { fields: [{ name: 'title', label: '标题', fieldType: 'text' }] } }];
    const first = normalizeCmsFieldDefinitions(fields);
    expect(normalizeCmsFieldDefinitions(fields, first)).toEqual(first);
    const invalid: CmsFieldDefinition[] = [{ name: 'title', label: '标题', fieldType: 'text', configuration: { requiredWhen: { field: 'title', equals: 'x' } } }, { name: 'title', label: '重复', fieldType: 'text' }];
    expect(validateCmsFieldDefinitions(invalid).map(issue => issue.message)).toEqual(['条件必填不能引用自身', '同级字段标识重复']);
  });

  it('distinguishes presentation edits from constraints that can invalidate existing contents', () => {
    const before: CmsFieldDefinition[] = [{ name: 'state', label: '状态', fieldType: 'select', options: [{ value: 'draft', label: '草稿' }, { value: 'live', label: '线上' }] }];
    expect(hasBreakingCmsFieldChanges(before, [{ ...before[0], label: '展示状态' }])).toBe(false);
    expect(hasBreakingCmsFieldChanges(before, [{ ...before[0], options: [{ value: 'live', label: '线上' }] }])).toBe(true);
    expect(hasBreakingCmsFieldChanges(before, [...before, { name: 'title', label: '标题', fieldType: 'text', required: true }])).toBe(true);
    expect(hasBreakingCmsFieldChanges(before, [...before, { name: 'title', label: '标题', fieldType: 'text', required: true, defaultValue: '默认标题' }])).toBe(false);
    expect(diffCmsFieldDefinitions(before, [{ ...before[0], label: '展示状态' }])).toMatchObject([{ path: 'state', kind: 'changed' }]);
  });

  it('walks nested references and gives uniqueness a stable definition path across reorder and block types', () => {
    const fields: CmsFieldDefinition[] = [{ name: 'blocks', label: '区块', fieldType: 'blocks', configuration: { blockTypes: [
      { code: 'product', label: '商品', fields: [{ name: 'link', label: '关联', fieldType: 'reference' }] },
      { code: 'article', label: '文章', fields: [{ name: 'link', label: '关联', fieldType: 'reference' }] },
    ] } }];
    const found: { value: unknown; path: string; definition: string }[] = [];
    walkCmsStructuredValues(fields, { blocks: [{ _id: 'one', blockType: 'product', link: 11 }, { _id: 'two', blockType: 'article', link: 12 }] }, (field, value, path, definition) => {
      if (field.fieldType === 'reference') found.push({ value, path, definition });
    });
    expect(found).toEqual([{ value: 11, path: 'extend.blocks.0.link', definition: 'extend.blocks[product].link' }, { value: 12, path: 'extend.blocks.1.link', definition: 'extend.blocks[article].link' }]);
  });
});
