import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsPageBlock, CmsPagePresetVersion } from '@zenith/shared/cms';
import CmsPagePresetLibrary from './CmsPagePresetLibrary';

const state = vi.hoisted(() => ({ instantiate: vi.fn(), confirm: vi.fn(), latest: null as CmsPagePresetVersion | null }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/queries/cms-channels', () => ({ useCmsChannelTree: () => ({ data: [] }) }));
vi.mock('./CmsAssetUrlField', () => ({ default: () => null }));
vi.mock('./CmsLinkInput', () => ({ useCmsLinkPicker: () => ({ suffix: null, hint: null, modals: null }) }));
vi.mock('@/utils/confirm', () => ({ confirmDanger: (input: { onOk: () => Promise<unknown> }) => { state.confirm(input); void input.onOk(); } }));
vi.mock('@/hooks/queries/cms-page-presets', () => ({
  useCmsPagePresets: () => ({ data: [{ id: 7, siteId: 1, name: '专题组合', currentVersion: 2, blockCount: 1 }], refetch: vi.fn() }),
  useCmsPagePresetDetail: () => ({ data: state.latest, refetch: vi.fn() }),
  useCmsPagePresetVersions: () => ({ data: [], refetch: vi.fn() }),
  useCmsPagePresetVersion: () => ({ data: undefined }),
  useCmsPagePresetUsages: () => ({ data: [], refetch: vi.fn() }),
  useSaveCmsPagePreset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopyCmsPagePreset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInstantiateCmsPagePreset: () => ({ mutateAsync: state.instantiate, mutate: vi.fn(), isPending: false }),
}));

function existingBlocks(): CmsPageBlock[] {
  const source = { presetId: 7, version: 1, instanceId: 'instance_old', values: { title: '插入时标题' } };
  return [
    { id: 'old_hero', type: 'hero', props: { title: '本地调整的标题' }, presetSource: { ...source, blockId: 'hero' } },
    { id: 'old_text', type: 'richtext', props: { html: '<p>旧正文</p>' }, presetSource: { ...source, blockId: 'text' } },
    { id: 'unrelated', type: 'hero', props: { title: '其他区块' } },
  ];
}

beforeEach(() => {
  state.instantiate.mockReset(); state.confirm.mockReset();
  state.latest = { id: 72, presetId: 7, siteId: 1, version: 2, name: '专题组合', description: null, note: null, createdAt: '2026-09-29 12:00:00',
    blocks: [{ id: 'hero', type: 'hero', props: { title: '新版默认标题' } }],
    parameters: [{ key: 'title', label: '主标题', blockId: 'hero', field: 'title' }],
  };
  state.instantiate.mockResolvedValue({ blocks: [{ id: 'new_hero', type: 'hero', props: { title: '本地调整的标题' } }] });
});

describe('组合实例升级', () => {
  it('replaces the entire source instance when only one member is selected and preserves current parameter values', async () => {
    const apply = vi.fn();
    render(<CmsPagePresetLibrary siteId={1} blocks={existingBlocks()} selectedBlockIds={['old_hero']} onApply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: '组合预设库' }));
    fireEvent.click(await screen.findByRole('button', { name: '升级当前组合' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'new_hero' })]), 'replace-selected', ['old_hero', 'old_text']));
    expect(state.instantiate).toHaveBeenCalledWith({ params: { id: 7 }, body: { version: 2, values: { title: '本地调整的标题' } } });
    expect(state.confirm).toHaveBeenCalledOnce();
  });

  it('blocks an upgrade if any unselected member of the source instance is protected', async () => {
    const blocks = existingBlocks(); blocks[1].canManage = false;
    render(<CmsPagePresetLibrary siteId={1} blocks={blocks} selectedBlockIds={['old_hero']} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '组合预设库' }));
    expect(await screen.findByRole('button', { name: '升级当前组合' })).toBeDisabled();
    expect(state.instantiate).not.toHaveBeenCalled();
  });
});
