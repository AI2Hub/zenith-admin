import type { QueryClient } from '@tanstack/react-query';
import type { BodyOf } from '@zenith/shared/core';
import { cmsComponentContract } from '@zenith/shared/cms';
import { contractKey, createResourceQueries, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

const resource = createResourceQueries(cmsComponentContract, {
  onSaved: (qc, saved) => { void qc.invalidateQueries({ queryKey: contractKey(cmsComponentContract.impact, { params: { id: saved.id } }) }); },
  onDeleted: (qc, ids) => {
    for (const id of ids) {
      qc.removeQueries({ queryKey: contractKey(cmsComponentContract.versions, { params: { id } }) });
      qc.removeQueries({ queryKey: contractKey(cmsComponentContract.impact, { params: { id } }) });
    }
  },
});
export const cmsComponentKeys = resource.keys;
export const useCmsComponentList = resource.useList;
export const useCmsComponentDetail = resource.useDetail;
export function useAllCmsComponents(siteId?: number) {
  return useApiQuery(cmsComponentContract.all, { query: { siteId } }, { enabled: siteId !== undefined, staleTime: LOOKUP_STALE_TIME });
}
export function useCmsComponentVersions(id?: number, siteId?: number) {
  return useApiQuery(cmsComponentContract.versions, { params: { id: id ?? 0 }, query: { siteId } }, { enabled: id !== undefined });
}
export function useCmsComponentImpact(id?: number, siteId?: number) {
  return useApiQuery(cmsComponentContract.impact, { params: { id: id ?? 0 }, query: { siteId } }, { enabled: id !== undefined });
}
function invalidateComponent(qc: QueryClient, id?: number) {
  void qc.invalidateQueries({ queryKey: cmsComponentKeys.lists });
  void qc.invalidateQueries({ queryKey: cmsComponentKeys.lookup });
  if (id !== undefined) {
    void qc.invalidateQueries({ queryKey: cmsComponentKeys.detail(id) });
    void qc.invalidateQueries({ queryKey: contractKey(cmsComponentContract.versions, { params: { id } }) });
    void qc.invalidateQueries({ queryKey: contractKey(cmsComponentContract.impact, { params: { id } }) });
  }
}
export type CmsComponentSaveValues = Partial<BodyOf<typeof cmsComponentContract.create>> & { expectedVersion?: number };
export const useSaveCmsComponent = resource.useSave;
export function usePublishCmsComponent() {
  return useApiMutation(cmsComponentContract.publish, { invalidate: (qc, saved) => invalidateComponent(qc, saved.id) });
}
export function useDeleteCmsComponent() {
  const remove = resource.useDelete();
  return { mutateAsync: (id: number) => remove.mutateAsync([id]), isPending: remove.isPending };
}
