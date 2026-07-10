import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelReportFillRecordInput,
  CloneReportFillTemplateInput,
  CreateReportFillRecordInput,
  CreateReportFillTemplateInput,
  PaginatedResponse,
  ReportFillRecord,
  ReportFillRecordStatus,
  ReportFillTemplate,
  ReportFillTemplateLifecycleActionInput,
  ReportFillTemplateStatus,
  ReviewReportFillRecordInput,
  SubmitReportFillRecordInput,
  UpdateReportFillRecordInput,
  UpdateReportFillTemplateInput,
} from '@zenith/shared';
import { request } from '@/utils/request';
import { LOOKUP_STALE_TIME, toQueryString, unwrap } from '@/lib/query';
import { asyncTaskKeys } from './async-tasks';
import { reportDatasetKeys } from './report-datasets';

export interface ReportFillTemplateListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: ReportFillTemplateStatus;
  ownerId?: number;
  folderId?: number;
}

export interface ReportFillMineParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: ReportFillRecordStatus;
  templateId?: number;
}

export interface ReportFillAdminParams {
  page: number;
  pageSize: number;
  status?: ReportFillRecordStatus;
  templateId?: number;
  submitterId?: number;
}

export const reportFillKeys = {
  all: ['report', 'fill'] as const,
  templateLists: ['report', 'fill', 'templates', 'list'] as const,
  templateList: (params: ReportFillTemplateListParams) => ['report', 'fill', 'templates', 'list', params] as const,
  templateDetail: (id: number | undefined) => ['report', 'fill', 'templates', 'detail', id] as const,
  templateLookup: ['report', 'fill', 'templates', 'lookup'] as const,
  recordLists: ['report', 'fill', 'records'] as const,
  recordMine: (params: ReportFillMineParams) => ['report', 'fill', 'records', 'mine', params] as const,
  recordAdmin: (params: ReportFillAdminParams) => ['report', 'fill', 'records', 'admin', params] as const,
  recordDetail: (id: number | undefined) => ['report', 'fill', 'records', 'detail', id] as const,
};

export function useReportFillTemplateList(params: ReportFillTemplateListParams) {
  return useQuery({
    queryKey: reportFillKeys.templateList(params),
    queryFn: () => request
      .get<PaginatedResponse<ReportFillTemplate>>(`/api/report/fill/templates${toQueryString(params)}`, { silent: true })
      .then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportFillTemplateDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportFillKeys.templateDetail(id),
    queryFn: () => request.get<ReportFillTemplate>(`/api/report/fill/templates/${id}`, { silent: true }).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function useReportFillTemplateLookup(enabled = true) {
  return useQuery({
    queryKey: reportFillKeys.templateLookup,
    queryFn: () => request.get<ReportFillTemplate[]>('/api/report/fill/templates/lookup', { silent: true }).then(unwrap),
    enabled,
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function useReportFillRecordMine(params: ReportFillMineParams) {
  return useQuery({
    queryKey: reportFillKeys.recordMine(params),
    queryFn: () => request
      .get<PaginatedResponse<ReportFillRecord>>(`/api/report/fill/records/mine${toQueryString(params)}`, { silent: true })
      .then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportFillRecordAdmin(params: ReportFillAdminParams, enabled = true) {
  return useQuery({
    queryKey: reportFillKeys.recordAdmin(params),
    queryFn: () => request
      .get<PaginatedResponse<ReportFillRecord>>(`/api/report/fill/records/admin${toQueryString(params)}`, { silent: true })
      .then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useReportFillRecordDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportFillKeys.recordDetail(id),
    queryFn: () => request.get<ReportFillRecord>(`/api/report/fill/records/${id}`, { silent: true }).then(unwrap),
    enabled: enabled && id !== undefined,
    refetchInterval: (query) => {
      const record = query.state.data;
      return record && (record.syncStatus === 'pending' || record.syncStatus === 'running') ? 3000 : false;
    },
  });
}

function useFillInvalidatingMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidate: (queryClient: ReturnType<typeof useQueryClient>, data: TData, variables: TVariables) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => invalidate(queryClient, data, variables),
  });
}

function invalidateTemplates(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: reportFillKeys.templateLists });
  void queryClient.invalidateQueries({ queryKey: reportFillKeys.templateLookup });
}

export function useCreateReportFillTemplate() {
  return useFillInvalidatingMutation(
    (values: CreateReportFillTemplateInput) =>
      request.post<ReportFillTemplate>('/api/report/fill/templates', values, { silent: true }).then(unwrap),
    invalidateTemplates,
  );
}

export function useUpdateReportFillTemplate() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: UpdateReportFillTemplateInput }) =>
      request.put<ReportFillTemplate>(`/api/report/fill/templates/${id}`, values, { silent: true }).then(unwrap),
    (queryClient, template) => {
      queryClient.setQueryData(reportFillKeys.templateDetail(template.id), template);
      invalidateTemplates(queryClient);
    },
  );
}

export function useChangeReportFillTemplateLifecycle() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: ReportFillTemplateLifecycleActionInput }) =>
      request.post<ReportFillTemplate>(`/api/report/fill/templates/${id}/lifecycle`, values, { silent: true }).then(unwrap),
    (queryClient, template) => {
      queryClient.setQueryData(reportFillKeys.templateDetail(template.id), template);
      invalidateTemplates(queryClient);
    },
  );
}

export function useCloneReportFillTemplate() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: CloneReportFillTemplateInput }) =>
      request.post<ReportFillTemplate>(`/api/report/fill/templates/${id}/clone`, values, { silent: true }).then(unwrap),
    invalidateTemplates,
  );
}

export function useDeleteReportFillTemplate() {
  return useFillInvalidatingMutation(
    (id: number) => request.delete<null>(`/api/report/fill/templates/${id}`, undefined, { silent: true }).then(unwrap),
    (queryClient, _data, id) => {
      queryClient.removeQueries({ queryKey: reportFillKeys.templateDetail(id) });
      invalidateTemplates(queryClient);
    },
  );
}

function invalidateFillRecords(queryClient: ReturnType<typeof useQueryClient>, record: ReportFillRecord) {
  queryClient.setQueryData(reportFillKeys.recordDetail(record.id), record);
  void queryClient.invalidateQueries({ queryKey: reportFillKeys.recordLists });
  void queryClient.invalidateQueries({ queryKey: asyncTaskKeys.all });
  if (record.generatedDatasetId) {
    void queryClient.invalidateQueries({ queryKey: reportDatasetKeys.all });
  }
}

export function useCreateReportFillRecord() {
  return useFillInvalidatingMutation(
    (values: CreateReportFillRecordInput) =>
      request.post<ReportFillRecord>('/api/report/fill/records', values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}

export function useUpdateReportFillRecord() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: UpdateReportFillRecordInput }) =>
      request.put<ReportFillRecord>(`/api/report/fill/records/${id}`, values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}

export function useSubmitReportFillRecord() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: SubmitReportFillRecordInput }) =>
      request.post<ReportFillRecord>(`/api/report/fill/records/${id}/submit`, values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}

export function useWithdrawReportFillRecord() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: CancelReportFillRecordInput }) =>
      request.post<ReportFillRecord>(`/api/report/fill/records/${id}/withdraw`, values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}

export function useCancelReportFillRecord() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: CancelReportFillRecordInput }) =>
      request.post<ReportFillRecord>(`/api/report/fill/records/${id}/cancel`, values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}

export function useReviewReportFillRecord() {
  return useFillInvalidatingMutation(
    ({ id, values }: { id: number; values: ReviewReportFillRecordInput }) =>
      request.post<ReportFillRecord>(`/api/report/fill/records/${id}/review`, values, { silent: true }).then(unwrap),
    invalidateFillRecords,
  );
}
