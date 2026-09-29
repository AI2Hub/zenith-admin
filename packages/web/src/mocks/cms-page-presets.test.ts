import { describe, expect, it } from 'vitest';
import { cmsPagePresetContract, type CmsPageBlock, type CmsPagePreset, type CmsPagePresetUsage, type CmsPagePresetVersion, type CmsPagePresetVersionSummary } from '@zenith/shared/cms';
import { cmsPagePresetHandlers } from './handlers/cms-page-presets';
import { mockCmsPages, mockCmsSites } from './data/cms';
import { mockCmsPagePresets, mockCmsPagePresetVersions } from './data/cms-page-presets';

async function call<T>(method: string, path: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${cmsPagePresetContract.basePath}${path}`, { method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  for (const handler of cmsPagePresetHandlers) {
    const result = await handler.run({ request: request.clone(), requestId: 'page-preset-test' });
    if (result?.response) return { status: result.response.status, ...(await result.response.json() as { code: number; message: string; data: T }) };
  }
  throw new Error(`Missing handler for ${method} ${path}`);
}

describe('组合预设 Demo 版本与快照', () => {
  it('supports parameterized instances, CAS history and independent copies without editing existing pages', async () => {
    const site = mockCmsSites[0];
    const page = mockCmsPages.find(item => item.siteId === site.id)!;
    const originalBlocks = structuredClone(page.blocks);
    const initialPresetIds = new Set(mockCmsPagePresets.map(item => item.id));
    const initialVersionIds = new Set(mockCmsPagePresetVersions.map(item => item.id));
    try {
      const definition = { siteId: site.id, name: 'QA 组合', blocks: [{ id: 'hero', type: 'hero', props: { title: '原始标题' } }], parameters: [{ key: 'title', label: '标题', blockId: 'hero', field: 'title' }] };
      const created = await call<CmsPagePreset>('POST', '', definition);
      expect(created.code).toBe(0);
      const id = created.data.id;
      const first = await call<{ blocks: CmsPageBlock[] }>('POST', `/${id}/instantiate`, { version: 1, values: { title: '页面自定义标题' } });
      const second = await call<{ blocks: CmsPageBlock[] }>('POST', `/${id}/instantiate`, { version: 1 });
      expect(first.data.blocks[0].props.title).toBe('页面自定义标题');
      expect(first.data.blocks[0].id).not.toBe(second.data.blocks[0].id);
      expect(first.data.blocks[0].presetSource).toMatchObject({ presetId: id, version: 1, values: { title: '页面自定义标题' } });
      page.blocks = structuredClone(first.data.blocks);
      const versionBody = { ...definition, expectedVersion: 1, name: 'QA 新版本', blocks: [{ id: 'hero', type: 'hero', props: { title: '新版本标题' } }], note: '增加版式' };
      expect((await call<CmsPagePreset>('POST', `/${id}/versions`, versionBody)).data.currentVersion).toBe(2);
      expect((await call('POST', `/${id}/versions`, versionBody)).status).toBe(409);
      const history = await call<CmsPagePresetVersionSummary[]>('GET', `/${id}/versions`);
      expect(history.data.map(item => item.version)).toEqual([2, 1]);
      expect(history.data[0]).not.toHaveProperty('blocks');
      const frozen = await call<CmsPagePresetVersion>('GET', `/${id}/versions/1`);
      expect(frozen.data.blocks[0].props.title).toBe('原始标题');
      expect(page.blocks[0].props.title).toBe('页面自定义标题');
      expect((await call<CmsPagePresetUsage[]>('GET', `/${id}/usages`)).data[0]).toMatchObject({ pageId: page.id, sourceVersion: 1, latestVersion: 2, canUpgrade: true });
      const copy = await call<CmsPagePreset>('POST', `/${id}/copy`, { name: 'QA 副本' });
      expect(copy.data.id).not.toBe(id);
      expect(copy.data.currentVersion).toBe(1);
      const copySnapshot = await call<CmsPagePresetVersion>('GET', `/${copy.data.id}`);
      expect(copySnapshot.data.blocks[0].props.title).toBe('新版本标题');
      expect(copySnapshot.data.blocks[0].presetSource).toBeUndefined();
      expect((await call('POST', `/${id}/instantiate`, { version: 1, values: { unlisted: '不能替换' } })).status).toBe(400);
    } finally {
      page.blocks = originalBlocks;
      for (let i = mockCmsPagePresets.length - 1; i >= 0; i--) if (!initialPresetIds.has(mockCmsPagePresets[i].id)) mockCmsPagePresets.splice(i, 1);
      for (let i = mockCmsPagePresetVersions.length - 1; i >= 0; i--) if (!initialVersionIds.has(mockCmsPagePresetVersions[i].id)) mockCmsPagePresetVersions.splice(i, 1);
    }
  });
});
