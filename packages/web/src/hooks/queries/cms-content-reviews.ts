import type { QueryOf } from '@zenith/shared/core';
import { cmsContentReviewContract, cmsOperationsContract } from '@zenith/shared/cms';
import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';

export const cmsContentReviewKeys = { lists: contractKey(cmsContentReviewContract.list), details: contractKey(cmsContentReviewContract.detail), records: contractKey(cmsContentReviewContract.records) };
function invalidate(qc: QueryClient, contentId?: number) {
  void qc.invalidateQueries({ queryKey: cmsContentReviewKeys.lists });
  void qc.invalidateQueries({ queryKey: contentId ? contractKey(cmsContentReviewContract.detail, { params: { id: contentId } }) : cmsContentReviewKeys.details });
  void qc.invalidateQueries({ queryKey: contentId ? contractKey(cmsContentReviewContract.records, { params: { id: contentId } }) : cmsContentReviewKeys.records });
  void qc.invalidateQueries({ queryKey: contractKey(cmsOperationsContract.workspace) });
  void qc.invalidateQueries({ queryKey: contractKey(cmsOperationsContract.tasks) });
}
export function useCmsContentReviewPolicy(id?: number, enabled = true) { return useApiQuery(cmsContentReviewContract.detail, { params: { id: id ?? 0 } }, { enabled: !!id && enabled, refetchInterval: enabled ? 15000 : false }); }
export function useCmsContentReviewRecords(id?: number, enabled = true) { return useApiQuery(cmsContentReviewContract.records, { params: { id: id ?? 0 } }, { enabled: !!id && enabled }); }
export function useCmsContentReviewPolicies(query: QueryOf<typeof cmsContentReviewContract.list>) { return useApiQuery(cmsContentReviewContract.list, { query }, { enabled: query.siteId > 0, placeholderData: keepPreviousData }); }
export function useSaveCmsContentReviewPolicy() { return useApiMutation(cmsContentReviewContract.save, { invalidate: (qc, _, { params }) => invalidate(qc, params.id) }); }
export function useCompleteCmsContentReview() { return useApiMutation(cmsContentReviewContract.complete, { invalidate: (qc, _, { params }) => invalidate(qc, params.id) }); }
export function useScanCmsContentReviews() { return useApiMutation(cmsContentReviewContract.scan, { invalidate: (qc, _, { body }) => invalidate(qc, body.contentId) }); }
