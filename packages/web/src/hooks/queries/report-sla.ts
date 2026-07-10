import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AsyncTask,
  CreateReportSlaRuleInput,
  PaginatedResponse,
  ReportSlaRule,
  ReportSlaType,
  ReportSlaViolation,
  ReportSlaViolationStatus,
  UpdateReportSlaRuleInput,
  UpdateReportSlaViolationInput,
} from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export const reportSlaKeys = {
  all: ['report', 'sla'] as const,
  lists: ['report', 'sla', 'list'] as const,
  list: (params: object) => ['report', 'sla', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'sla', 'detail', id] as const,
  violations: (params: object) => ['report', 'sla', 'violations', params] as const,
};

export function useReportSlaRuleList(params: {
  page: number; pageSize: number; datasetId?: number; type?: ReportSlaType; enabled?: boolean;
}) {
  return useQuery({
    queryKey: reportSlaKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportSlaRule>>(`/api/report/sla/rules${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportSlaRuleDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportSlaKeys.detail(id),
    queryFn: () => request.get<ReportSlaRule>(`/api/report/sla/rules/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useSaveReportSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportSlaRuleInput | UpdateReportSlaRuleInput }) =>
      (id
        ? request.put<ReportSlaRule>(`/api/report/sla/rules/${id}`, values, { silent: true })
        : request.post<ReportSlaRule>('/api/report/sla/rules', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportSlaKeys.all }),
  });
}

export function useDeleteReportSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/sla/rules/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportSlaKeys.all }),
  });
}

export function useEvaluateReportSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.post<AsyncTask>(`/api/report/sla/rules/${id}/evaluate`, {}, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportSlaKeys.all }),
  });
}

export function useReportSlaViolationList(params: {
  page: number; pageSize: number; datasetId?: number; ruleId?: number; status?: ReportSlaViolationStatus;
}) {
  return useQuery({
    queryKey: reportSlaKeys.violations(params),
    queryFn: () => request.get<PaginatedResponse<ReportSlaViolation>>(`/api/report/sla/violations${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateReportSlaViolation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: UpdateReportSlaViolationInput }) =>
      request.post<ReportSlaViolation>(`/api/report/sla/violations/${id}/status`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportSlaKeys.all }),
  });
}
