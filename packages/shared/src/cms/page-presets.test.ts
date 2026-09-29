import { describe, expect, it } from 'vitest';
import { buildCmsPagePresetInstance, resolveCmsPagePresetValues, validateCmsPagePresetDefinition, validateCmsPagePresetSources } from './page-presets';
import { createCmsPagePresetSchema } from './validation';
import type { CmsPagePresetVersion } from './contracts/page-presets';

const snapshot: CmsPagePresetVersion = {
  id: 90, presetId: 9, siteId: 3, version: 1, name: '城市活动专题', description: null, note: null, createdAt: '2026-09-29 10:00:00',
  blocks: [
    { id: 'hero', type: 'hero', props: { title: '原始标题', image: 'cms-res://11', buttonUrl: '/events', nested: { label: '独立内容' } } },
    { id: 'news', type: 'content-list', props: { count: 5, channelCode: 'news' } },
  ],
  parameters: [
    { key: 'heading', label: '专题标题', blockId: 'hero', field: 'title' },
    { key: 'cover', label: '封面', blockId: 'hero', field: 'image' },
    { key: 'amount', label: '条数', blockId: 'news', field: 'count' },
  ],
};

describe('page preset snapshots and declared parameters', () => {
  it('materializes separate snapshots and preserves source identities without ACL inheritance', () => {
    const source = structuredClone(snapshot);
    source.blocks[0].canManage = false;
    const first = buildCmsPagePresetInstance(source, { heading: '九月活动', amount: 8 }, 'one');
    const second = buildCmsPagePresetInstance(source, {}, 'two');
    expect(first[0]).toMatchObject({ id: 'one_1', props: { title: '九月活动' }, presetSource: { presetId: 9, version: 1, blockId: 'hero', instanceId: 'one', values: { heading: '九月活动', amount: 8, cover: 'cms-res://11' } } });
    expect(first[0]).not.toHaveProperty('canManage');
    first[0].props.title = '本地改动';
    (first[0].props.nested as { label: string }).label = '局部';
    source.blocks[0].props.title = '组合更新';
    expect(second[0].props).toMatchObject({ title: '原始标题', nested: { label: '独立内容' } });
    expect(first[0].presetSource?.version).toBe(1);
  });

  it('rejects undeclared, nested, prototype, mismatched and duplicate parameter mappings', () => {
    for (const invalid of ['__proto__', 'constructor', 'prototype', 'props.title', 'image.url']) {
      const candidate = { siteId: 3, name: '参数测试', blocks: snapshot.blocks, parameters: [{ key: invalid, label: 'bad', blockId: 'hero', field: 'title' }] };
      expect(createCmsPagePresetSchema.safeParse(candidate).success).toBe(false);
    }
    expect(() => validateCmsPagePresetDefinition(snapshot.blocks, [{ key: 'bad', label: 'bad', blockId: 'news', field: 'image' }])).toThrow();
    expect(() => validateCmsPagePresetDefinition(snapshot.blocks, [...snapshot.parameters, { ...snapshot.parameters[0], key: 'duplicate' }])).toThrow();
    expect(() => resolveCmsPagePresetValues(snapshot, { unknown: 'value' })).toThrow('未声明');
    expect(() => resolveCmsPagePresetValues(snapshot, { cover: 'javascript:alert(1)' })).toThrow();
    expect(() => resolveCmsPagePresetValues(snapshot, { amount: 100 })).toThrow();
    expect(() => resolveCmsPagePresetValues(snapshot, { amount: '5' })).toThrow();
  });

  it('retains provenance through local props edits and partial replacement', () => {
    const blocks = buildCmsPagePresetInstance(snapshot, { heading: '活动' }, 'local');
    blocks[0].props.title = '作者自己的标题';
    expect(() => validateCmsPagePresetSources(blocks, [snapshot], 3)).not.toThrow();
    expect(() => validateCmsPagePresetSources(blocks.slice(0, 1), [snapshot], 3)).not.toThrow();
  });

  it('rejects cross-site, absent versions and inconsistent metadata within an instance', () => {
    const blocks = buildCmsPagePresetInstance(snapshot, {}, 'same');
    expect(() => validateCmsPagePresetSources(blocks, [snapshot], 4)).toThrow();
    expect(() => validateCmsPagePresetSources(blocks, [], 3)).toThrow();
    const wrong = structuredClone(blocks);
    wrong[1].presetSource!.values.heading = 'inconsistent';
    expect(() => validateCmsPagePresetSources(wrong, [snapshot], 3)).toThrow('不一致');
    const duplicate = structuredClone(blocks[0]); duplicate.id = 'different-id';
    expect(() => validateCmsPagePresetSources([blocks[0], duplicate], [snapshot], 3)).toThrow('不一致');
    const unknown = structuredClone(blocks); unknown[0].presetSource!.blockId = 'nonexistent';
    expect(() => validateCmsPagePresetSources(unknown, [snapshot], 3)).toThrow();
    const changedType = structuredClone(blocks); changedType[0].type = 'image';
    expect(() => validateCmsPagePresetSources(changedType, [snapshot], 3)).toThrow();
  });
});
