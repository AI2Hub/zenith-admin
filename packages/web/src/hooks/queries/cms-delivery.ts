import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import type { QueryOf } from '@zenith/shared/core';
import { cmsDeliveryContract, type CmsDeliveryRunSummary } from '@zenith/shared/cms';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';

const running = (row?: CmsDeliveryRunSummary) => !!row && ['activated', 'cache_refreshing', 'checking'].includes(row.status);
export function invalidateCmsDelivery(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: contractKey(cmsDeliveryContract.list) });
  void qc.invalidateQueries({ queryKey: contractKey(cmsDeliveryContract.detail) });
}
export const useCmsDeliveryConfig = (siteId?: number) => useApiQuery(cmsDeliveryContract.config, { query: { siteId: siteId ?? 0 } }, { enabled: !!siteId });
export const useCmsDeliveryRuns = (query: QueryOf<typeof cmsDeliveryContract.list>, enabled = true) => useApiQuery(cmsDeliveryContract.list, { query }, {
  enabled: enabled && !!query.siteId, placeholderData: keepPreviousData,
  refetchInterval: state => state.state.data?.list.some(running) ? 3000 : false,
});
export const useCmsDeliveryRun = (id?: number) => useApiQuery(cmsDeliveryContract.detail, { params: { id: id ?? 0 } }, { enabled: !!id, refetchInterval: state => running(state.state.data) ? 3000 : false });
export const useSaveCmsDeliveryConfig = () => useApiMutation(cmsDeliveryContract.saveConfig, { invalidate: (qc) => {
  void qc.invalidateQueries({ queryKey: contractKey(cmsDeliveryContract.config) }); invalidateCmsDelivery(qc);
} });
export const useStartCmsDelivery = () => useApiMutation(cmsDeliveryContract.start, { invalidate: invalidateCmsDelivery });
export const useRetryCmsDelivery = () => useApiMutation(cmsDeliveryContract.retry, { invalidate: invalidateCmsDelivery });
