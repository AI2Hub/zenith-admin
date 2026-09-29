import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { cmsDeliveryContract } from '@zenith/shared/cms';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper, observeFetches } from '@/test-utils/query-harness';
import { contractKey, urlOf } from '@/lib/contract-query';
import { asyncTaskKeys, useAsyncTaskList, useAsyncTaskTypes } from './async-tasks';
import { useCmsDeliveryConfig, useCmsDeliveryRun, useCmsDeliveryRuns, useRetryCmsDelivery, useSaveCmsDeliveryConfig, useStartCmsDelivery } from './cms-delivery';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));
const config = { siteId: 1, version: 2, sourceBaseUrl: null, publicBaseUrl: null, effectiveSourceBaseUrl: null, paths: ['/'] };
const run = { id: 7, siteId: 1, status: 'unverified' };
const emptyPage = { list: [], total: 0, page: 1, pageSize: 10 };

beforeEach(() => {
  api.reset();
  api.on('GET', cmsDeliveryContract.config.fullPath, config)
    .on('GET', cmsDeliveryContract.list.fullPath, { ...emptyPage, list: [run], total: 1 })
    .on('GET', urlOf(cmsDeliveryContract.detail, { params: { id: 7 } }), run)
    .on('PUT', cmsDeliveryContract.saveConfig.fullPath, { ...config, version: 3 })
    .on('POST', urlOf(cmsDeliveryContract.start), { ...run, id: 8 })
    .on('POST', urlOf(cmsDeliveryContract.retry, { params: { id: 7 } }), { ...run, id: 9 })
    .on('GET', '/api/async-tasks', emptyPage).on('GET', '/api/async-tasks/types', []);
});

function mount() {
  const qc = createTestQueryClient();
  const hook = renderHook(() => ({
    config: useCmsDeliveryConfig(1), list: useCmsDeliveryRuns({ siteId: 1 }), detail: useCmsDeliveryRun(7),
    tasks: useAsyncTaskList({ page: 1, pageSize: 10 }), taskTypes: useAsyncTaskTypes(),
    save: useSaveCmsDeliveryConfig(), start: useStartCmsDelivery(), retry: useRetryCmsDelivery(),
  }), { wrapper: createWrapper(qc) });
  return { qc, hook };
}
async function settle(hook: ReturnType<typeof mount>['hook']) {
  await waitFor(() => {
    expect(hook.result.current.config.isSuccess).toBe(true);
    expect(hook.result.current.list.isSuccess).toBe(true);
    expect(hook.result.current.detail.isSuccess).toBe(true);
    expect(hook.result.current.tasks.isSuccess).toBe(true);
    expect(hook.result.current.taskTypes.isSuccess).toBe(true);
  });
}

describe('CMS delivery evidence cache', () => {
  it.each(['start', 'retry'] as const)('%s refreshes delivery evidence and task-center state without refetching configuration or task metadata', async (action) => {
    const { qc, hook } = mount(); await settle(hook);
    const fetches = observeFetches(qc); api.resetCalls();
    if (action === 'start') await hook.result.current.start.mutateAsync({ body: { siteId: 1 } });
    else await hook.result.current.retry.mutateAsync({ params: { id: 7 } });
    await waitFor(() => expect(fetches.countOf(asyncTaskKeys.lists)).toBe(1));
    expect(fetches.countOf(contractKey(cmsDeliveryContract.list))).toBe(1);
    expect(fetches.countOf(contractKey(cmsDeliveryContract.detail))).toBe(1);
    expect(fetches.countOf(contractKey(cmsDeliveryContract.config))).toBe(0);
    expect(fetches.countOf(asyncTaskKeys.types)).toBe(0);
    fetches.stop();
  });

  it('saves the configuration version and reloads evidence superseded by the new entry points', async () => {
    const { qc, hook } = mount(); await settle(hook);
    const fetches = observeFetches(qc); api.resetCalls();
    await hook.result.current.save.mutateAsync({ query: { siteId: 1 }, body: { expectedVersion: 2, sourceBaseUrl: null, publicBaseUrl: 'https://example.com', paths: ['/'] } });
    await waitFor(() => expect(fetches.countOf(contractKey(cmsDeliveryContract.config))).toBe(1));
    expect(fetches.countOf(contractKey(cmsDeliveryContract.list))).toBe(1);
    expect(fetches.countOf(contractKey(cmsDeliveryContract.detail))).toBe(1);
    expect(fetches.countOf(asyncTaskKeys.lists)).toBe(0);
    expect(api.calls.find(call => call.method === 'PUT')?.body).toMatchObject({ expectedVersion: 2 });
    fetches.stop();
  });
});
