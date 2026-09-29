import type { CmsPageBlock, CmsPagePreset, CmsPagePresetParameter, CmsPagePresetVersion } from '@zenith/shared/cms';
import { mockCmsPages } from './cms';
import { mockDateTime } from '../utils/date';

export const mockCmsPagePresets: CmsPagePreset[] = [];
export const mockCmsPagePresetVersions: CmsPagePresetVersion[] = [];
let nextPresetId = 1;
let nextVersionId = 1;

/** 快照只保留可写业务配置，不复制来源实例和当前用户的区块权限标记。 */
export function snapshotMockCmsPresetBlocks(blocks: readonly CmsPageBlock[]): CmsPageBlock[] {
  return blocks.map(block => ({ id: block.id, type: block.type, props: structuredClone(block.props),
    ...(block.displayCondition ? { displayCondition: structuredClone(block.displayCondition) } : {}),
  }));
}

export function addMockCmsPagePresetVersion(preset: CmsPagePreset, blocks: CmsPageBlock[], parameters: CmsPagePresetParameter[], note: string | null): CmsPagePresetVersion {
  const version: CmsPagePresetVersion = {
    id: nextVersionId++, presetId: preset.id, siteId: preset.siteId, version: preset.currentVersion,
    name: preset.name, description: preset.description, note, createdAt: mockDateTime(),
    blocks: snapshotMockCmsPresetBlocks(blocks), parameters: structuredClone(parameters),
  };
  mockCmsPagePresetVersions.push(version);
  return version;
}

export function createMockCmsPagePreset(input: { siteId: number; name: string; description?: string | null; blocks: CmsPageBlock[]; parameters: CmsPagePresetParameter[] }): CmsPagePreset {
  const now = mockDateTime();
  const preset: CmsPagePreset = { id: nextPresetId++, siteId: input.siteId, name: input.name,
    description: input.description ?? null, currentVersion: 1, blockCount: input.blocks.length,
    createdAt: now, updatedAt: now, createdBy: 1, updatedBy: 1,
  };
  mockCmsPagePresets.push(preset);
  addMockCmsPagePresetVersion(preset, input.blocks, input.parameters, null);
  return preset;
}

// 从已有共享页面种子派生每站示例，避免另造一套静态区块配置。
for (const page of mockCmsPages) {
  if (!page.blocks.length || mockCmsPagePresets.some(item => item.siteId === page.siteId)) continue;
  const hero = page.blocks.find(block => block.type === 'hero');
  createMockCmsPagePreset({ siteId: page.siteId, name: `${page.name}组合`, description: '从示例页面派生的独立组合，可按需插入和调整。',
    blocks: page.blocks.slice(0, 50), parameters: hero ? [{ key: 'title', label: '主标题', blockId: hero.id, field: 'title' }] : [],
  });
}
