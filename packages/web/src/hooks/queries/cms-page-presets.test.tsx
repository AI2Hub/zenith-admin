import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { cmsPagePresetContract, type CmsPageBlock } from '@zenith/shared/cms';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper, observeFetches, isFresh } from '@/test-utils/query-harness';
import {
  cmsPagePresetKeys, useCmsPagePresets, useCmsPagePresetDetail, useCmsPagePresetVersions, useCmsPagePresetVersion,
  useCmsPagePresetUsages, useSaveCmsPagePreset, useInstantiateCmsPagePreset, invalidateCmsPagePresetUsages,
} from './cms-page-presets';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));
const base = cmsPagePresetContract.basePath;
const preset = { id: 3, siteId: 1, name: '专题页组合', description: null, currentVersion: 1, blockCount: 1, createdAt: '2026-09-29 12:00:00', updatedAt: '2026-09-29 12:00:00' };
const blocks: CmsPageBlock[] = [{ id: 'hero', type: 'hero', props: { title: '专题' } }];
const snapshot = { ...preset, presetId: 3, version: 1, note: null, blocks, parameters: [] };

beforeEach(() => {
  api.reset();
  api.on('GET', base, [preset]).on('GET', `${base}/3`, snapshot)
    .on('GET', `${base}/3/versions`, [snapshot]).on('GET', `${base}/3/versions/1`, snapshot)
    .on('GET', `${base}/3/usages`, []).on('GET', `${base}/4`, { ...snapshot, id: 4, presetId: 4 })
    .on('POST', `${base}/3/versions`, { ...preset, currentVersion: 2 })
    .on('POST', `${base}/3/instantiate`, { blocks: snapshot.blocks });
});

function mount() {
  const qc = createTestQueryClient();
  const hook = renderHook(() => ({
    list: useCmsPagePresets(1), anotherSite: useCmsPagePresets(2), latest: useCmsPagePresetDetail(3),
    history: useCmsPagePresetVersions(3), snapshot: useCmsPagePresetVersion(3, 1), usages: useCmsPagePresetUsages(3),
    anotherPreset: useCmsPagePresetDetail(4), save: useSaveCmsPagePreset(), instantiate: useInstantiateCmsPagePreset(),
  }), { wrapper: createWrapper(qc) });
  return { qc, hook };
}

async function settle(hook: ReturnType<typeof mount>['hook']) {
  await waitFor(() => {
    expect(hook.result.current.list.isSuccess).toBe(true);
    expect(hook.result.current.anotherSite.isSuccess).toBe(true);
    expect(hook.result.current.latest.isSuccess).toBe(true);
    expect(hook.result.current.history.isSuccess).toBe(true);
    expect(hook.result.current.snapshot.isSuccess).toBe(true);
    expect(hook.result.current.usages.isSuccess).toBe(true);
    expect(hook.result.current.anotherPreset.isSuccess).toBe(true);
  });
}

describe('组合版本库缓存边界', () => {
  it('refreshes current metadata and upgrade impact while preserving immutable history and other sites', async () => {
    const { qc, hook } = mount(); await settle(hook);
    const fetches = observeFetches(qc); api.resetCalls();
    await hook.result.current.save.mutateAsync({ id: 3, values: { name: '专题页组合 v2', blocks: snapshot.blocks, parameters: [], expectedVersion: 1 } });
    await waitFor(() => expect(fetches.countOf(cmsPagePresetKeys.usages(3))).toBe(1));
    expect(fetches.countOf(cmsPagePresetKeys.list(1))).toBe(1);
    expect(fetches.countOf(cmsPagePresetKeys.detail(3))).toBe(1);
    expect(fetches.countOf(cmsPagePresetKeys.versions(3))).toBe(1);
    expect(fetches.countOf(cmsPagePresetKeys.version(3, 1))).toBe(0);
    expect(fetches.countOf(cmsPagePresetKeys.list(2))).toBe(0);
    expect(fetches.countOf(cmsPagePresetKeys.detail(4))).toBe(0);
    expect(isFresh(qc, cmsPagePresetKeys.version(3, 1))).toBe(true);
    expect(api.calls.find(call => call.method === 'POST')?.body).toMatchObject({ expectedVersion: 1 });
    fetches.stop();
  });

  it('does not claim unsaved instances are used; a later page save refreshes usages only', async () => {
    const { qc, hook } = mount(); await settle(hook);
    const fetches = observeFetches(qc); api.resetCalls();
    await hook.result.current.instantiate.mutateAsync({ params: { id: 3 }, body: { version: 1, values: {} } });
    expect(api.countOf('GET')).toBe(0);
    invalidateCmsPagePresetUsages(qc);
    await waitFor(() => expect(fetches.countOf(cmsPagePresetKeys.usages(3))).toBe(1));
    expect(fetches.countOf(cmsPagePresetKeys.list(1))).toBe(0);
    expect(fetches.countOf(cmsPagePresetKeys.detail(3))).toBe(0);
    expect(fetches.countOf(cmsPagePresetKeys.version(3, 1))).toBe(0);
    fetches.stop();
  });
});
