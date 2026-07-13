import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePaymentResult, PaginatedResponse, PaymentLink, PaymentLinkPublic } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface PaymentLinkListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

export interface PublicPaymentLinkPayValues {
  token: string;
  amount?: number;
  payMethod?: string;
}

export const paymentLinkKeys = {
  all: ['payment-links'] as const,
  lists: ['payment-links', 'list'] as const,
  list: (params: PaymentLinkListParams) => ['payment-links', 'list', params] as const,
  detail: (id: number | undefined) => ['payment-links', 'detail', id] as const,
  public: (token: string | undefined) => ['payment-links', 'public', token] as const,
};

export function usePaymentLinkList(params: PaymentLinkListParams) {
  return useQuery({
    queryKey: paymentLinkKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<PaymentLink>>(`/api/payment/links${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function usePaymentLinkDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: paymentLinkKeys.detail(id),
    queryFn: () => request.get<PaymentLink>(`/api/payment/links/${id}`).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

export function useSavePaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Partial<PaymentLink> }) =>
      (id === undefined
        ? request.post<PaymentLink>('/api/payment/links', values)
        : request.put<PaymentLink>(`/api/payment/links/${id}`, values)
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentLinkKeys.all }),
  });
}

export function useDeletePaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/payment/links/${id}`).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentLinkKeys.all }),
  });
}

export function useRotatePaymentLinkToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.post<PaymentLink>(`/api/payment/links/${id}/rotate-token`).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentLinkKeys.all }),
  });
}

export function usePublicPaymentLink(token: string | undefined) {
  return useQuery({
    queryKey: paymentLinkKeys.public(token),
    queryFn: () =>
      request.get<PaymentLinkPublic>(`/api/public/payment/link/${encodeURIComponent(token ?? '')}`, { skipAuth: true, silent: true }).then(unwrap),
    enabled: !!token,
  });
}

export function usePayPublicPaymentLink() {
  return useMutation({
    mutationFn: ({ token, amount, payMethod }: PublicPaymentLinkPayValues) =>
      request.post<{ orderNo: string; payParams: CreatePaymentResult }>(
        `/api/public/payment/link/${encodeURIComponent(token)}/pay`,
        { amount, payMethod },
        { skipAuth: true, silent: true },
      ).then(unwrap),
  });
}

/** 收银台订单状态轮询（下单后每 3s 查询，终态自动停止） */
export function usePublicLinkOrderStatus(token: string, orderNo: string | undefined) {
  return useQuery({
    queryKey: ['payment-links', 'public-order-status', token, orderNo] as const,
    queryFn: () =>
      request.get<{ status: string; paidAt: string | null }>(
        `/api/public/payment/link/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderNo ?? '')}/status`,
        { skipAuth: true, silent: true },
      ).then(unwrap),
    enabled: !!orderNo,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'closed' || status === 'failed' || status === 'refunded' ? false : 3000;
    },
  });
}
