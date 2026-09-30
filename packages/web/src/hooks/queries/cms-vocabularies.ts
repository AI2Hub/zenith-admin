import { cmsVocabularyContract, cmsTagContract } from '@zenith/shared/cms';
import { contractKey, createResourceQueries, useApiQuery } from '@/lib/contract-query';
const resource = createResourceQueries(cmsVocabularyContract, {
  onSaved: qc => { void qc.invalidateQueries({ queryKey: contractKey(cmsTagContract.all) }); },
  onDeleted: qc => { void qc.invalidateQueries({ queryKey: contractKey(cmsTagContract.all) }); },
});
export const useCmsVocabularyList = resource.useList;
export const useSaveCmsVocabulary = resource.useSave;
export const useDeleteCmsVocabularies = resource.useDelete;
export function useAllCmsVocabularies(siteId?: number) {
  return useApiQuery(cmsVocabularyContract.all, { query: { siteId: siteId ?? 0 } }, { enabled: siteId !== undefined });
}
