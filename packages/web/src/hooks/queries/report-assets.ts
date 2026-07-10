import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplyReportAssetTemplateInput,
  CreateReportAssetTemplateInput,
  CreateReportDeprecationNoticeInput,
  PaginatedResponse,
  ReportAssetCatalogItem,
  ReportAssetTemplate,
  ReportAssetTemplateApplyResult,
  ReportAssetTemplateType,
  ReportAssetUsageSummary,
  ReportAssetUsageTrendPoint,
  ReportDeprecationNotice,
  ReportResourceType,
  UpdateReportAssetTemplateInput,
  UpdateReportDeprecationNoticeInput,
} from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export const reportAssetKeys = {
  all: ['report', 'assets'] as const,
  lists: ['report', 'assets', 'list'] as const,
  list: (params: object) => ['report', 'assets', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'assets', 'detail', id] as const,
  usage: (resourceType: ReportResourceType | undefined, id: number | undefined, days: number) => ['report', 'assets', 'usage', resourceType, id, days] as const,
  top: (params: object) => ['report', 'assets', 'top', params] as const,
  inactive: (params: object) => ['report', 'assets', 'inactive', params] as const,
  trend: (params: object) => ['report', 'assets', 'trend', params] as const,
  deprecations: (params: object) => ['report', 'assets', 'deprecations', params] as const,
  templateLists: ['report', 'assets', 'templates'] as const,
  templates: (params: object) => ['report', 'assets', 'templates', params] as const,
  templateDetail: (id: number | undefined) => ['report', 'assets', 'template-detail', id] as const,
};

export function useReportAssetCatalog(params: {
  page: number; pageSize: number; keyword?: string; types?: string; ownerId?: number; folderId?: number;
  lifecycle?: string; status?: string; updatedStart?: string; updatedEnd?: string;
}) {
  return useQuery({
    queryKey: reportAssetKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportAssetCatalogItem>>(`/api/report/assets/catalog${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportAssetUsage(resourceType: ReportResourceType | undefined, id: number | undefined, days = 30, enabled = true) {
  return useQuery({
    queryKey: reportAssetKeys.usage(resourceType, id, days),
    queryFn: () => request.get<ReportAssetUsageSummary>(`/api/report/assets/usage/${resourceType}/${id}${toQueryString({ days })}`).then(unwrap),
    enabled: enabled && !!resourceType && !!id,
  });
}

export function useTopReportAssets(params: { days: number; limit: number }) {
  return useQuery({
    queryKey: reportAssetKeys.top(params),
    queryFn: () => request.get<ReportAssetUsageSummary[]>(`/api/report/assets/usage/top${toQueryString(params)}`).then(unwrap),
  });
}

export function useInactiveReportAssets(params: { days: number; page: number; pageSize: number }) {
  return useQuery({
    queryKey: reportAssetKeys.inactive(params),
    queryFn: () => request.get<PaginatedResponse<ReportAssetCatalogItem>>(`/api/report/assets/usage/inactive${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportAssetUsageTrend(params: {
  days: number; bucket?: 'hour' | 'day'; resourceType?: ReportResourceType; resourceId?: number;
}) {
  return useQuery({
    queryKey: reportAssetKeys.trend(params),
    queryFn: () => request.get<ReportAssetUsageTrendPoint[]>(`/api/report/assets/usage/trend${toQueryString(params)}`).then(unwrap),
  });
}

export function useReportDeprecationList(params: {
  page: number; pageSize: number; resourceType?: ReportResourceType; resourceId?: number; published?: boolean;
}, enabled = true) {
  return useQuery({
    queryKey: reportAssetKeys.deprecations(params),
    queryFn: () => request.get<PaginatedResponse<ReportDeprecationNotice>>(`/api/report/assets/deprecations${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSaveReportDeprecation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportDeprecationNoticeInput | UpdateReportDeprecationNoticeInput }) =>
      (id
        ? request.put<ReportDeprecationNotice>(`/api/report/assets/deprecations/${id}`, values, { silent: true })
        : request.post<ReportDeprecationNotice>('/api/report/assets/deprecations', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function usePublishReportDeprecation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: number; publish: boolean }) =>
      request.post<ReportDeprecationNotice>(`/api/report/assets/deprecations/${id}/publish`, { publish }, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function useDeleteReportDeprecation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/assets/deprecations/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function useReportAssetTemplateList(params: {
  page: number; pageSize: number; keyword?: string; type?: ReportAssetTemplateType; status?: 'enabled' | 'disabled';
}) {
  return useQuery({
    queryKey: reportAssetKeys.templates(params),
    queryFn: () => request.get<PaginatedResponse<ReportAssetTemplate>>(`/api/report/assets/templates${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportAssetTemplateDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportAssetKeys.templateDetail(id),
    queryFn: () => request.get<ReportAssetTemplate>(`/api/report/assets/templates/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useSaveReportAssetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportAssetTemplateInput | UpdateReportAssetTemplateInput }) =>
      (id
        ? request.put<ReportAssetTemplate>(`/api/report/assets/templates/${id}`, values, { silent: true })
        : request.post<ReportAssetTemplate>('/api/report/assets/templates', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function useCloneReportAssetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, folderId }: { id: number; name: string; folderId?: number | null }) =>
      request.post<ReportAssetTemplate>(`/api/report/assets/templates/${id}/clone`, { name, folderId }, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function useApplyReportAssetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: ApplyReportAssetTemplateInput }) =>
      request.post<ReportAssetTemplateApplyResult>(`/api/report/assets/templates/${id}/apply`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}

export function useDeleteReportAssetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/assets/templates/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAssetKeys.all }),
  });
}
