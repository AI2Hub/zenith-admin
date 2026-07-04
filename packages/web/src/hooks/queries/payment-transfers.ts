import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, PaymentTransfer } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface PaymentTransferListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  channel?: string;
  status?: string;
}

export interface PaymentTransferSummary {
  totalAmount: number;
  successCount: number;
  processingCount: number;
  failedCount: number;
}

export const paymentTransferKeys = {
  all: ['payment-transfers'] as const,
  lists: ['payment-transfers', 'list'] as const,
  list: (params: PaymentTransferListParams) => ['payment-transfers', 'list', params] as const,
  summary: ['payment-transfers', 'summary'] as const,
  detail: (id: number | undefined) => ['payment-transfers', 'detail', id] as const,
};

export function usePaymentTransferList(params: PaymentTransferListParams) {
  return useQuery({
    queryKey: paymentTransferKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<PaymentTransfer>>(`/api/payment/transfers${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function usePaymentTransferSummary(enabled = true) {
  return useQuery({
    queryKey: paymentTransferKeys.summary,
    queryFn: () => request.get<PaymentTransferSummary>('/api/payment/transfers/summary').then(unwrap),
    enabled,
  });
}

export function useCreatePaymentTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { channel: string; receiverAccount: string; receiverName?: string; amount: number; remark?: string }) =>
      request.post<PaymentTransfer>('/api/payment/transfers', values).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentTransferKeys.all }),
  });
}

export function useQueryPaymentTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.post<PaymentTransfer>(`/api/payment/transfers/${id}/query`).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentTransferKeys.all }),
  });
}

export function useRetryPaymentTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.post<PaymentTransfer>(`/api/payment/transfers/${id}/retry`).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentTransferKeys.all }),
  });
}
