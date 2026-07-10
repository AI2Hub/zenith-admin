import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AsyncTask, PaginatedResponse, ReportMaterializationSnapshot, RequestReportMaterializationInput } from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export const reportMaterializationKeys = {
  all: ['report', 'materializations'] as const,
  lists: ['report', 'materializations', 'list'] as const,
  list: (params: { datasetId: number; page: number; pageSize: number }) => ['report', 'materializations', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'materializations', 'detail', id] as const,
  current: (datasetId: number | undefined) => ['report', 'materializations', 'current', datasetId] as const,
};

export function useReportMaterializationList(params: { datasetId: number; page: number; pageSize: number }, enabled = true) {
  const { datasetId, ...query } = params;
  return useQuery({
    queryKey: reportMaterializationKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportMaterializationSnapshot>>(`/api/report/materializations/datasets/${datasetId}/snapshots${toQueryString(query)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled: enabled && datasetId > 0,
  });
}

export function useCurrentReportMaterialization(datasetId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportMaterializationKeys.current(datasetId),
    queryFn: () => request.get<ReportMaterializationSnapshot | null>(`/api/report/materializations/datasets/${datasetId}/current`).then(unwrap),
    enabled: enabled && !!datasetId,
  });
}

export function useRefreshReportMaterialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, values }: { datasetId: number; values: RequestReportMaterializationInput }) =>
      request.post<AsyncTask>(`/api/report/materializations/datasets/${datasetId}/refresh`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMaterializationKeys.all }),
  });
}

export function usePurgeReportMaterialization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/materializations/snapshots/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMaterializationKeys.all }),
  });
}

export function usePurgeDatasetMaterializations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datasetId: number) => request.delete<null>(`/api/report/materializations/datasets/${datasetId}/snapshots`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportMaterializationKeys.all }),
  });
}
