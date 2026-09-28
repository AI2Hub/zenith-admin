import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper } from '@/test-utils/query-harness';
import { useCmsStatsOverview, useCmsStatsQuality, useConfigureCmsTelemetry } from './cms-stats';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));
beforeEach(() => {
  api.reset();
  api.on('GET', '/api/cms/stats/quality', { status: 'disabled' }).on('GET', '/api/cms/stats/overview', { status: 'disabled' }).on('PUT', '/api/cms/telemetry/1', { siteId: 1, enabled: true, timeZone: 'UTC', requiresPublication: true });
});
describe('CMS collection settings cache', () => {
  it('refreshes current site status immediately while preserving another site cache', async () => {
    const qc = createTestQueryClient();
    const { result } = renderHook(() => ({ current: useCmsStatsQuality({ siteId: 1 }), other: useCmsStatsQuality({ siteId: 2 }), overview: useCmsStatsOverview({ siteId: 1 }), configure: useConfigureCmsTelemetry() }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.current.isSuccess && result.current.other.isSuccess && result.current.overview.isSuccess).toBe(true));
    api.resetCalls();
    api.on('GET', '/api/cms/stats/quality', { status: 'pending_publication' });
    await result.current.configure.mutateAsync({ params: { id: 1 }, body: { enabled: true, timeZone: 'UTC' } });
    await waitFor(() => expect(result.current.current.data?.status).toBe('pending_publication'));
    expect(result.current.other.data?.status).toBe('disabled');
    expect(api.urls('GET').filter((url) => url.includes('/stats/quality'))).toEqual(['/api/cms/stats/quality?siteId=1']);
    expect(api.countOf('GET', '/api/cms/stats/overview')).toBe(1);
  });
});
