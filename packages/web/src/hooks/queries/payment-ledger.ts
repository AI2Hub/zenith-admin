import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, PaymentAccount, PaymentAccountCheckRow, PaymentLedgerEntry, PaymentLedgerSummary } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface PaymentLedgerFilterParams {
  keyword?: string;
  direction?: string;
  type?: string;
  channel?: string;
  startTime?: string;
  endTime?: string;
}

export interface PaymentLedgerListParams extends PaymentLedgerFilterParams {
  page: number;
  pageSize: number;
}

export const paymentLedgerKeys = {
  all: ['payment-ledger'] as const,
  lists: ['payment-ledger', 'list'] as const,
  list: (params: PaymentLedgerListParams) => ['payment-ledger', 'list', params] as const,
  summary: (params: PaymentLedgerFilterParams) => ['payment-ledger', 'summary', params] as const,
  detail: (id: number | undefined) => ['payment-ledger', 'detail', id] as const,
  accounts: ['payment-ledger', 'accounts'] as const,
  accountCheck: ['payment-ledger', 'accounts', 'check'] as const,
};

export function usePaymentLedgerList(params: PaymentLedgerListParams, enabled = true) {
  return useQuery({
    queryKey: paymentLedgerKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<PaymentLedgerEntry>>(`/api/payment/ledger/entries${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePaymentLedgerSummary(params: PaymentLedgerFilterParams, enabled = true) {
  return useQuery({
    queryKey: paymentLedgerKeys.summary(params),
    queryFn: () => request.get<PaymentLedgerSummary>(`/api/payment/ledger/summary${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePaymentAccounts(enabled = true) {
  return useQuery({
    queryKey: paymentLedgerKeys.accounts,
    queryFn: () => request.get<PaymentAccount[]>('/api/payment/accounts').then(unwrap),
    enabled,
  });
}

export function useCheckPaymentAccounts() {
  return useMutation({
    mutationFn: () => request.get<PaymentAccountCheckRow[]>('/api/payment/accounts/check').then(unwrap),
  });
}

export function useRebuildPaymentAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request.post<{ accounts: number }>('/api/payment/accounts/rebuild').then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentLedgerKeys.all }),
  });
}

export function useAdjustPaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { channel: string; direction: 'in' | 'out'; amount: number; remark?: string }) =>
      request.post<PaymentAccount>('/api/payment/accounts/adjust', values).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentLedgerKeys.all }),
  });
}
