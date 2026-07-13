import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, PaymentRiskHit, PaymentRiskReview, PaymentRiskRule } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface PaymentRiskRuleListParams {
  page: number;
  pageSize: number;
  scope?: string;
  status?: string;
}

export interface PaymentRiskHitListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  action?: string;
  dimension?: string;
  channel?: string;
}

export interface PaymentRiskReviewListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  channel?: string;
}

export const paymentRiskKeys = {
  all: ['payment-risk'] as const,
  lists: ['payment-risk', 'list'] as const,
  list: (params: PaymentRiskRuleListParams) => ['payment-risk', 'list', params] as const,
  detail: (id: number | undefined) => ['payment-risk', 'detail', id] as const,
  hitLists: ['payment-risk', 'hits'] as const,
  hitList: (params: PaymentRiskHitListParams) => ['payment-risk', 'hits', params] as const,
  reviewLists: ['payment-risk', 'reviews'] as const,
  reviewList: (params: PaymentRiskReviewListParams) => ['payment-risk', 'reviews', params] as const,
};

export function usePaymentRiskRuleList(params: PaymentRiskRuleListParams) {
  return useQuery({
    queryKey: paymentRiskKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<PaymentRiskRule>>(`/api/payment/risk-rules${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useSavePaymentRiskRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Partial<PaymentRiskRule> }) =>
      (id === undefined
        ? request.post<PaymentRiskRule>('/api/payment/risk-rules', values)
        : request.put<PaymentRiskRule>(`/api/payment/risk-rules/${id}`, values)
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentRiskKeys.all }),
  });
}

export function useDeletePaymentRiskRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/payment/risk-rules/${id}`).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentRiskKeys.all }),
  });
}

export function usePaymentRiskHitList(params: PaymentRiskHitListParams) {
  return useQuery({
    queryKey: paymentRiskKeys.hitList(params),
    queryFn: () => request.get<PaginatedResponse<PaymentRiskHit>>(`/api/payment/risk/hits${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function usePaymentRiskReviewList(params: PaymentRiskReviewListParams) {
  return useQuery({
    queryKey: paymentRiskKeys.reviewList(params),
    queryFn: () => request.get<PaginatedResponse<PaymentRiskReview>>(`/api/payment/risk/reviews${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useApprovePaymentRiskReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }: { id: number; remark?: string }) =>
      request.post<PaymentRiskReview>(`/api/payment/risk/reviews/${id}/approve`, { remark }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentRiskKeys.all }),
  });
}

export function useRejectPaymentRiskReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remark }: { id: number; remark?: string }) =>
      request.post<PaymentRiskReview>(`/api/payment/risk/reviews/${id}/reject`, { remark }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentRiskKeys.all }),
  });
}
