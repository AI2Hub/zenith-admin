import { cmsContentCollectionContract as contract } from '@zenith/shared/cms';
import { contractKey, createResourceQueries, useApiQuery } from '@/lib/contract-query';
const resource = createResourceQueries(contract, { onSaved: (qc, saved) => {
  void qc.invalidateQueries({ queryKey: contractKey(contract.preview, { params: { id: saved.id } }) });
  void qc.invalidateQueries({ queryKey: contractKey(contract.versions, { params: { id: saved.id } }) });
} });
export const useCmsCollectionList = resource.useList;
export const useSaveCmsCollection = resource.useSave;
export const useDeleteCmsCollections = resource.useDelete;
export function useAllCmsCollections(siteId?: number) { return useApiQuery(contract.all, { query: { siteId: siteId ?? 0 } }, { enabled: !!siteId }); }
export function useCmsCollectionPreview(id?: number) { return useApiQuery(contract.preview, { params: { id: id ?? 0 } }, { enabled: !!id }); }
export function useCmsCollectionVersions(id?: number) { return useApiQuery(contract.versions, { params: { id: id ?? 0 } }, { enabled: !!id }); }
