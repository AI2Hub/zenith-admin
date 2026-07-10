import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AsyncTask,
  CreateReportDqRuleInput,
  PaginatedResponse,
  ReportDqAnomaly,
  ReportDqAnomalyStatus,
  ReportDqRule,
  ReportDqRuleType,
  ReportDqRun,
  ReportDqRunStatus,
  ReportDqScore,
  RunReportDqRuleInput,
  UpdateReportDqAnomalyStatusInput,
  UpdateReportDqRuleInput,
} from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export const reportDqKeys = {
  all: ['report', 'dq'] as const,
  lists: ['report', 'dq', 'list'] as const,
  list: (params: object) => ['report', 'dq', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'dq', 'detail', id] as const,
  runs: (params: object) => ['report', 'dq', 'runs', params] as const,
  anomalies: (params: object) => ['report', 'dq', 'anomalies', params] as const,
  scores: (datasetId: number | undefined, params: object) => ['report', 'dq', 'scores', datasetId, params] as const,
  currentScore: (datasetId: number | undefined) => ['report', 'dq', 'score', datasetId] as const,
};

export function useReportDqRuleList(params: {
  page: number; pageSize: number; datasetId?: number; type?: ReportDqRuleType; enabled?: boolean;
}) {
  return useQuery({
    queryKey: reportDqKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportDqRule>>(`/api/report/dq/rules${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportDqRuleDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportDqKeys.detail(id),
    queryFn: () => request.get<ReportDqRule>(`/api/report/dq/rules/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useSaveReportDqRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportDqRuleInput | UpdateReportDqRuleInput }) =>
      (id
        ? request.put<ReportDqRule>(`/api/report/dq/rules/${id}`, values, { silent: true })
        : request.post<ReportDqRule>('/api/report/dq/rules', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportDqKeys.all }),
  });
}

export function useDeleteReportDqRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/dq/rules/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportDqKeys.all }),
  });
}

export function useToggleReportDqRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.post<ReportDqRule>(`/api/report/dq/rules/${id}/toggle`, {}, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportDqKeys.all }),
  });
}

export function useRunReportDqRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: RunReportDqRuleInput }) =>
      request.post<AsyncTask>(`/api/report/dq/rules/${id}/run`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportDqKeys.all }),
  });
}

export function useReportDqRunList(params: {
  page: number; pageSize: number; datasetId?: number; ruleId?: number; status?: ReportDqRunStatus;
}) {
  return useQuery({
    queryKey: reportDqKeys.runs(params),
    queryFn: () => request.get<PaginatedResponse<ReportDqRun>>(`/api/report/dq/runs${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportDqScoreHistory(datasetId: number | undefined, params: { page: number; pageSize: number }, enabled = true) {
  return useQuery({
    queryKey: reportDqKeys.scores(datasetId, params),
    queryFn: () => request.get<PaginatedResponse<ReportDqScore>>(`/api/report/dq/datasets/${datasetId}/scores${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled: enabled && !!datasetId,
  });
}

export function useCurrentReportDqScore(datasetId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportDqKeys.currentScore(datasetId),
    queryFn: () => request.get<ReportDqScore | null>(`/api/report/dq/datasets/${datasetId}/score`).then(unwrap),
    enabled: enabled && !!datasetId,
  });
}

export function useReportDqAnomalyList(params: {
  page: number; pageSize: number; datasetId?: number; status?: ReportDqAnomalyStatus;
}, enabled = true) {
  return useQuery({
    queryKey: reportDqKeys.anomalies(params),
    queryFn: () => request.get<PaginatedResponse<ReportDqAnomaly>>(`/api/report/dq/anomalies${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUpdateReportDqAnomalyStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: UpdateReportDqAnomalyStatusInput }) =>
      request.post<ReportDqAnomaly>(`/api/report/dq/anomalies/${id}/status`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportDqKeys.all }),
  });
}
