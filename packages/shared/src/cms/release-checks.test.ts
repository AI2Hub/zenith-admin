import { describe, expect, it } from 'vitest';
import { collectCmsReleaseModelValues, inspectCmsReleaseConfiguration, makeCmsReleaseCheck, resolveEffectivelyEnabledChannelIds } from './release-checks';
import type { CmsFieldDefinition } from './model-design';

describe('CMS publication readiness', () => {
  it('collects every independent configuration blocker with an editor location', () => {
    const checks = inspectCmsReleaseConfiguration({ siteId: 2, enabledChannelIds: new Set(), visibleContentIds: new Set(), configuration: { replaceAll: [], tables: {
      cms_pages: [{ id: 8, name: '首页', status: 'enabled', blocks: [
        { id: 'recommendation', type: 'widget-ref', props: { widgetId: 4 } },
        { id: 'action', type: 'hero', props: { title: '标题', buttonText: '详情', buttonUrl: 'entity:content/9' } },
      ] }],
      cms_widget_refs: [{ owner_type: 'theme_slot', field: 'aside', widget_id: 6 }],
    } } });
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'widget-target', reference: { kind: 'widget', id: 4 }, nodeId: 'recommendation', editTarget: { href: '/cms/pages?siteId=2&page=8&field=widgetId&block=recommendation', label: '定位处理' } }),
      expect.objectContaining({ code: 'widget-target', object: expect.objectContaining({ kind: 'site' }), reference: { kind: 'widget', id: 6 } }),
      expect.objectContaining({ code: 'link-target', recommendedAction: 'select-approved', reference: { kind: 'content', id: 9 }, nodeId: 'action' }),
    ]));
  });

  it('uses a selected collection instead of stale channel and tag filters', () => {
    const input = { siteId: 2, enabledChannelIds: new Set<number>(), visibleContentIds: new Set<number>(), configuration: { replaceAll: [], tables: {
      cms_pages: [{ id: 8, name: '首页', status: 'enabled', blocks: [{ id: 'feed', type: 'content-list', props: { collectionId: 12, channelId: 99, tagSlug: 'removed' } }] }],
      cms_content_collections: [{ id: 12, site_id: 2 }],
    } } };
    expect(inspectCmsReleaseConfiguration(input).filter(check => check.severity === 'error')).toEqual([]);
    input.configuration.tables.cms_content_collections[0].site_id = 3;
    expect(inspectCmsReleaseConfiguration(input)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'collection-target', fieldPath: 'collectionId', nodeId: 'feed' })]));
  });

  it('keeps nested reference locations and applies one unique domain across repeated instances', () => {
    const fields: CmsFieldDefinition[] = [{ name: 'cards', label: '卡片', fieldType: 'array', configuration: { fields: [
      { name: 'sku', label: 'SKU', fieldType: 'text', configuration: { unique: true } },
      { name: 'target', label: '目标', fieldType: 'reference', configuration: { referenceModelIds: [7] } },
    ] } }];
    const values = collectCmsReleaseModelValues(fields, { cards: [{ _id: 'a', sku: 'same', target: 4 }, { _id: 'b', sku: 'same', target: 5 }] });
    expect(values.uniqueValues.map(value => [value.fieldPath, value.key])).toEqual([['extend.cards.0.sku', 'cards[].sku'], ['extend.cards.1.sku', 'cards[].sku']]);
    expect(values.references).toEqual([{ id: 4, fieldPath: 'extend.cards.0.target', fieldLabel: '目标', modelIds: [7] }, { id: 5, fieldPath: 'extend.cards.1.target', fieldLabel: '目标', modelIds: [7] }]);
    expect(makeCmsReleaseCheck({ siteId: 2, object: { kind: 'content', id: 3, title: '产品', revisionId: 10 }, fieldPath: values.uniqueValues[1].fieldPath, code: 'model-unique', message: '重复值' }).editTarget?.href).toBe('/cms/contents/edit?id=3&siteId=2&field=extend.cards.1.sku');
  });

  it('rejects descendants of disabled or cyclic channels', () => {
    expect([...resolveEffectivelyEnabledChannelIds([{ id: 1, parentId: 0, status: 'disabled' }, { id: 2, parentId: 1, status: 'enabled' }, { id: 3, parentId: 4, status: 'enabled' }, { id: 4, parentId: 3, status: 'enabled' }, { id: 5, parentId: 0, status: 'enabled' }])]).toEqual([5]);
  });
});
