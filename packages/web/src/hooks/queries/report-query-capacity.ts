import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportQueryQuotaInput,
  PaginatedResponse,
  ReportQueryCostLog,
  ReportQueryCostStats,
  ReportQueryCostTrendPoint,
  ReportQueryQuota,
  ReportQueryQuotaUsage,
  UpdateReportQueryQuotaInput,
} from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export const reportQueryCapacityKeys = {
  all: ['report', 'query-capacity'] as const,
  lists: ['report', 'query-capacity', 'list'] as const,
  list: (params: { page: number; pageSize: number }) => ['report', 'query-capacity', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'query-capacity', 'detail', id] as const,
  usage: (id: number | undefined, scopeDate?: string) => ['report', 'query-capacity', 'usage', id, scopeDate] as const,
  costLogs: (params: object) => ['report', 'query-capacity', 'cost-logs', params] as const,
  costStats: (params: object) => ['report', 'query-capacity', 'cost-stats', params] as const,
  costTrend: (params: object) => ['report', 'query-capacity', 'cost-trend', params] as const,
};

export function useReportQueryQuotaList(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportQueryQuota>>(`/api/report/query-capacity/quotas${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportQueryQuotaDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.detail(id),
    queryFn: () => request.get<ReportQueryQuota>(`/api/report/query-capacity/quotas/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useSaveReportQueryQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportQueryQuotaInput | UpdateReportQueryQuotaInput }) =>
      (id
        ? request.put<ReportQueryQuota>(`/api/report/query-capacity/quotas/${id}`, values, { silent: true })
        : request.post<ReportQueryQuota>('/api/report/query-capacity/quotas', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportQueryCapacityKeys.all }),
  });
}

export function useDeleteReportQueryQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/query-capacity/quotas/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportQueryCapacityKeys.all }),
  });
}

export function useReportQueryQuotaUsage(id: number | undefined, scopeDate?: string, enabled = true) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.usage(id, scopeDate),
    queryFn: () => request.get<ReportQueryQuotaUsage>(`/api/report/query-capacity/quotas/${id}/usage${toQueryString({ scopeDate })}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useResetReportQueryQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scopeDate }: { id: number; scopeDate?: string }) =>
      request.post<null>(`/api/report/query-capacity/quotas/${id}/reset`, scopeDate ? { scopeDate } : {}, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportQueryCapacityKeys.all }),
  });
}

export interface ReportQueryCostParams {
  datasetId?: number;
  datasourceId?: number;
  start?: string;
  end?: string;
}

export function useReportQueryCostLogs(params: ReportQueryCostParams & {
  page: number; pageSize: number; userId?: number; scene?: string; success?: boolean;
}) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.costLogs(params),
    queryFn: () => request.get<PaginatedResponse<ReportQueryCostLog>>(`/api/report/query-capacity/cost-logs${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportQueryCostStats(params: ReportQueryCostParams) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.costStats(params),
    queryFn: () => request.get<ReportQueryCostStats>(`/api/report/query-capacity/cost-stats${toQueryString(params)}`).then(unwrap),
  });
}

export function useReportQueryCostTrend(params: ReportQueryCostParams & { bucket?: 'hour' | 'day' }) {
  return useQuery({
    queryKey: reportQueryCapacityKeys.costTrend(params),
    queryFn: () => request.get<ReportQueryCostTrendPoint[]>(`/api/report/query-capacity/cost-trend${toQueryString(params)}`).then(unwrap),
  });
}
