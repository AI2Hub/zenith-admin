import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportMetricInput,
  PaginatedResponse,
  ReportMetric,
  ReportMetricEvaluation,
  ReportMetricLifecycleActionInput,
  ReportMetricLookupOption,
  ReportMetricRefs,
  ReportMetricType,
  UpdateReportMetricInput,
} from '@zenith/shared';
import { LOOKUP_STALE_TIME, toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export interface ReportMetricListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  datasetId?: number;
  folderId?: number;
  ownerId?: number;
  type?: ReportMetricType;
  status?: 'draft' | 'published' | 'deprecated';
}

export const reportMetricKeys = {
  all: ['report', 'metrics'] as const,
  lists: ['report', 'metrics', 'list'] as const,
  list: (params: ReportMetricListParams) => ['report', 'metrics', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'metrics', 'detail', id] as const,
  lookup: (params: { keyword?: string; status?: 'draft' | 'published' | 'deprecated'; limit?: number }) =>
    ['report', 'metrics', 'lookup', params] as const,
  refs: (id: number | undefined) => ['report', 'metrics', 'refs', id] as const,
};

export function useReportMetricList(params: ReportMetricListParams) {
  return useQuery({
    queryKey: reportMetricKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportMetric>>(`/api/report/metrics${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportMetricDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportMetricKeys.detail(id),
    queryFn: () => request.get<ReportMetric>(`/api/report/metrics/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useReportMetricLookup(
  params: { keyword?: string; status?: 'draft' | 'published' | 'deprecated'; limit?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: reportMetricKeys.lookup(params),
    queryFn: () => request.get<ReportMetricLookupOption[]>(`/api/report/metrics/lookup${toQueryString(params)}`).then(unwrap),
    staleTime: LOOKUP_STALE_TIME,
    enabled,
  });
}

export function useReportMetricRefs(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportMetricKeys.refs(id),
    queryFn: () => request.get<ReportMetricRefs>(`/api/report/metrics/${id}/refs`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useSaveReportMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportMetricInput | UpdateReportMetricInput }) =>
      (id
        ? request.put<ReportMetric>(`/api/report/metrics/${id}`, values, { silent: true })
        : request.post<ReportMetric>('/api/report/metrics', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMetricKeys.all }),
  });
}

export function useDeleteReportMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/metrics/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMetricKeys.all }),
  });
}

export function useEvaluateReportMetric() {
  return useMutation({
    mutationFn: ({ id, params }: { id: number; params?: Record<string, unknown> }) =>
      request.post<ReportMetricEvaluation>(`/api/report/metrics/${id}/evaluate`, params ? { params } : {}, { silent: true }).then(unwrap),
  });
}

function useReportMetricLifecycle(action: 'publish' | 'deprecate') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: ReportMetricLifecycleActionInput }) =>
      request.post<ReportMetric>(`/api/report/metrics/${id}/${action}`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMetricKeys.all }),
  });
}

export function usePublishReportMetric() {
  return useReportMetricLifecycle('publish');
}

export function useDeprecateReportMetric() {
  return useReportMetricLifecycle('deprecate');
}
