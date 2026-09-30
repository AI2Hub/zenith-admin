import { describe, expect, it } from 'vitest';
import type { DbExecutor } from '../../db/types';
import { cmsPages, cmsWidgets, cmsChannels, cmsTags, cmsWidgetRefs, cmsContents } from '../../db/schema';
import { assertCmsReleaseDependencies, inspectCmsReleaseDependencies } from './cms-release-preflight.service';

function executor(overrides: Array<[unknown, unknown[]]>) {
  const data = new Map<unknown, unknown[]>([[cmsPages, []], [cmsWidgets, []], [cmsChannels, []], [cmsTags, []], [cmsWidgetRefs, []], [cmsContents, []], ...overrides]);
  // `where(...)` 既要能直接 await，也要支持继续链上 `.limit(...)`
  const rows = (table: unknown) => {
    const value = data.get(table) ?? [];
    return { limit: async () => value, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(value).then(resolve) };
  };
  return { select: () => ({ from: (table: unknown) => ({ where: () => rows(table) }) }) } as unknown as DbExecutor;
}
describe('CMS candidate dependency checks', () => {
  it('blocks a selected page when its widget was not included in the candidate', async () => {
    const tx = executor([[cmsPages, [{ id: 1, name: 'Home', blocks: [{ id: 'recommendations', type: 'widget-ref', props: { widgetId: 9 } }] }]]]);
    // 部件不在候选集合中时，页面区块体检先报错（同样是阻塞发布，只是文案不同）
    await expect(assertCmsReleaseDependencies(tx, 2)).rejects.toThrow('发布检查发现');
  });
  it('blocks a theme slot whose widget was not included in the candidate', async () => {
    const tx = executor([[cmsWidgetRefs, [{ siteId: 2, ownerType: 'theme_slot', field: 'home-aside', widgetId: 9 }]]]);
    await expect(assertCmsReleaseDependencies(tx, 2)).rejects.toThrow('未包含在候选公开集合');
  });
  it('checks widget content against the candidate public set', async () => {
    const tx = executor([
      [cmsChannels, [{ id: 3, parentId: 0, status: 'enabled' }]],
      [cmsWidgets, [{ id: 9, name: 'Recommendations', status: 'published', publishedData: { items: [{ id: 'entry', sourceType: 'content', sourceId: 7 }] } }]],
      [cmsContents, [{ id: 7, channelId: 3, status: 'draft', deletedAt: null, archivedAt: null, expireAt: null }]],
    ]);
    await expect(assertCmsReleaseDependencies(tx, 2)).rejects.toThrow('不在候选公开集合中');
  });
  it('reports independent page and slot failures together before blocking', async () => {
    const tx = executor([
      [cmsPages, [{ id: 1, name: 'Home', status: 'enabled', blocks: [{ id: 'missing-widget', type: 'widget-ref', props: { widgetId: 9 } }] }, { id: 2, name: 'Article', status: 'enabled', blocks: [{ id: 'empty-body', type: 'richtext', props: { html: '' } }] }]],
      [cmsWidgetRefs, [{ ownerType: 'theme_slot', field: 'aside', widgetId: 10 }]],
    ]);
    const checks = await inspectCmsReleaseDependencies(tx, 2);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ object: expect.objectContaining({ id: 1 }), nodeId: 'missing-widget', code: 'widget-target' }),
      expect.objectContaining({ object: expect.objectContaining({ id: 2 }), nodeId: 'empty-body', code: 'empty-richtext' }),
      expect.objectContaining({ object: expect.objectContaining({ kind: 'site' }), fieldPath: 'aside', code: 'widget-target' }),
    ]));
  });
});
