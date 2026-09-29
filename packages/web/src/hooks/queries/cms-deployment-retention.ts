import type { QueryOf } from '@zenith/shared/core';
import { cmsDeploymentRetentionContract, cmsReleaseContract } from '@zenith/shared/cms';
import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';

export const cmsDeploymentRetentionKeys = { list: contractKey(cmsDeploymentRetentionContract.list), summary: contractKey(cmsDeploymentRetentionContract.summary), preview: contractKey(cmsDeploymentRetentionContract.preview) };
export function invalidateCmsDeploymentRetention(qc: QueryClient) {
  for (const queryKey of Object.values(cmsDeploymentRetentionKeys)) void qc.invalidateQueries({ queryKey });
  void qc.invalidateQueries({ queryKey: contractKey(cmsReleaseContract.detail) });
}
export function useCmsDeploymentCapacity(query: QueryOf<typeof cmsDeploymentRetentionContract.list>) { return useApiQuery(cmsDeploymentRetentionContract.list, { query }, { enabled: query.siteId > 0, placeholderData: keepPreviousData }); }
export function useCmsDeploymentCapacitySummary(siteId?: number) { return useApiQuery(cmsDeploymentRetentionContract.summary, { params: { id: siteId ?? 0 } }, { enabled: !!siteId }); }
export function useCmsDeploymentCleanupPreview(siteId?: number, enabled = false) { return useApiQuery(cmsDeploymentRetentionContract.preview, { params: { id: siteId ?? 0 } }, { enabled: enabled && !!siteId }); }
export function useSaveCmsDeploymentRetentionPolicy() { return useApiMutation(cmsDeploymentRetentionContract.savePolicy, { invalidate: invalidateCmsDeploymentRetention }); }
export function usePinCmsDeployment() { return useApiMutation(cmsDeploymentRetentionContract.pin, { invalidate: invalidateCmsDeploymentRetention }); }
export function useMeasureCmsDeployments() { return useApiMutation(cmsDeploymentRetentionContract.measure, { invalidate: invalidateCmsDeploymentRetention }); }
export function useCleanupCmsDeployments() { return useApiMutation(cmsDeploymentRetentionContract.cleanup, { invalidate: invalidateCmsDeploymentRetention }); }
