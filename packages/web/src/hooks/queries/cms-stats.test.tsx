import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper } from '@/test-utils/query-harness';
import { useCmsStatsOverview, useCmsStatsQuality, useConfigureCmsTelemetry, useCmsTelemetryDeliveries, useCmsTelemetryDeliverySummary, useReplayCmsTelemetryDelivery } from './cms-stats';

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

describe('CMS telemetry delivery retry cache', () => {
  it('refreshes the affected site queue and leaves another site unchanged', async () => {
    for(const id of [1,2])api.on('GET', `/api/cms/telemetry/${id}/deliveries`, {list:[],total:0,page:1,pageSize:20}).on('GET', `/api/cms/telemetry/${id}/deliveries/summary`, {pending:1});
    api.on('POST', '/api/cms/telemetry/1/deliveries/3/replay', {queued:true,eventId:'event',mode:'delivery'});
    const qc=createTestQueryClient();
    const {result}=renderHook(()=>({list:useCmsTelemetryDeliveries(1,{page:1,pageSize:20},true), summary:useCmsTelemetryDeliverySummary(1), other:useCmsTelemetryDeliverySummary(2), replay:useReplayCmsTelemetryDelivery()}),{wrapper:createWrapper(qc)});
    await waitFor(()=>expect(result.current.list.isSuccess&&result.current.summary.isSuccess&&result.current.other.isSuccess).toBe(true));
    api.resetCalls();
    await result.current.replay.mutateAsync({params:{id:1,deliveryId:3}});
    await waitFor(()=>expect(api.countOf('GET','/api/cms/telemetry/1/deliveries/summary')).toBe(1));
    expect(api.countOf('GET','/api/cms/telemetry/2/deliveries/summary')).toBe(0);
  });
});
