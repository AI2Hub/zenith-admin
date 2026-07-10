import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportChatbiMessageInput,
  CreateReportChatbiSessionInput,
  PaginatedResponse,
  ReportChatbiMessage,
  ReportChatbiQuota,
  ReportChatbiSavedResource,
  ReportChatbiSession,
  ReportChatbiSessionDetail,
  ReportChatbiSessionStatus,
  SaveReportChatbiMessageAssetInput,
  UpdateReportChatbiSessionInput,
} from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';
import { reportDatasetKeys } from './report-datasets';
import { reportDashboardKeys } from './report-dashboards';

export interface ReportChatbiSessionListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: ReportChatbiSessionStatus;
  userId?: number;
}

export interface ReportChatbiAuditParams {
  page: number;
  pageSize: number;
  userId?: number;
  failedOnly?: boolean;
}

export const reportChatbiKeys = {
  all: ['report', 'chatbi'] as const,
  lists: ['report', 'chatbi', 'sessions', 'list'] as const,
  list: (params: ReportChatbiSessionListParams) => ['report', 'chatbi', 'sessions', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'chatbi', 'sessions', 'detail', id] as const,
  messages: (id: number | undefined) => ['report', 'chatbi', 'sessions', id, 'messages'] as const,
  quota: ['report', 'chatbi', 'quota'] as const,
  audit: (params: ReportChatbiAuditParams) => ['report', 'chatbi', 'audit', params] as const,
};

export function useReportChatbiSessionList(params: ReportChatbiSessionListParams) {
  return useQuery({
    queryKey: reportChatbiKeys.list(params),
    queryFn: () => request
      .get<PaginatedResponse<ReportChatbiSession>>(`/api/report/chatbi/sessions${toQueryString(params)}`)
      .then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useReportChatbiSessionDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportChatbiKeys.detail(id),
    queryFn: () => request.get<ReportChatbiSessionDetail>(`/api/report/chatbi/sessions/${id}`, { silent: true }).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

export function useReportChatbiMessages(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportChatbiKeys.messages(id),
    queryFn: () => request
      .get<ReportChatbiSessionDetail>(`/api/report/chatbi/sessions/${id}`, { silent: true })
      .then(unwrap)
      .then((detail) => detail.messages),
    enabled: enabled && id !== undefined,
  });
}

export function useReportChatbiQuota(enabled = true) {
  return useQuery({
    queryKey: reportChatbiKeys.quota,
    queryFn: () => request.get<ReportChatbiQuota>('/api/report/chatbi/quotas/me', { silent: true }).then(unwrap),
    enabled,
  });
}

export function useReportChatbiAudit(params: ReportChatbiAuditParams, enabled = true) {
  return useQuery({
    queryKey: reportChatbiKeys.audit(params),
    queryFn: () => request
      .get<PaginatedResponse<ReportChatbiMessage>>(`/api/report/chatbi/audit${toQueryString(params)}`)
      .then(unwrap),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateReportChatbiSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateReportChatbiSessionInput) =>
      request.post<ReportChatbiSession>('/api/report/chatbi/sessions', values, { silent: true }).then(unwrap),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.lists });
      queryClient.setQueryData(reportChatbiKeys.detail(session.id), { session, messages: [] });
    },
  });
}

export function useUpdateReportChatbiSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: UpdateReportChatbiSessionInput }) =>
      request.put<ReportChatbiSession>(`/api/report/chatbi/sessions/${id}`, values, { silent: true }).then(unwrap),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.lists });
      queryClient.setQueryData<ReportChatbiSessionDetail>(
        reportChatbiKeys.detail(session.id),
        (current) => current ? { ...current, session } : current,
      );
    },
  });
}

export function useArchiveReportChatbiSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      request.post<ReportChatbiSession>(`/api/report/chatbi/sessions/${id}/archive`, undefined, { silent: true }).then(unwrap),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.lists });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.detail(session.id) });
    },
  });
}

export function useDeleteReportChatbiSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      request.delete<null>(`/api/report/chatbi/sessions/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: reportChatbiKeys.detail(id) });
      queryClient.removeQueries({ queryKey: reportChatbiKeys.messages(id) });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.lists });
    },
  });
}

export function useAskReportChatbi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      values,
      signal,
    }: {
      sessionId: number;
      values: CreateReportChatbiMessageInput;
      signal?: AbortSignal;
    }) => request
      .post<ReportChatbiMessage>(`/api/report/chatbi/sessions/${sessionId}/ask`, values, { signal, silent: true })
      .then(unwrap),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.detail(variables.sessionId) });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.messages(variables.sessionId) });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.lists });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.quota });
    },
  });
}

export function useSaveReportChatbiMessageAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      values,
    }: {
      messageId: number;
      sessionId: number;
      values: SaveReportChatbiMessageAssetInput;
    }) => request
      .post<ReportChatbiSavedResource>(`/api/report/chatbi/messages/${messageId}/save`, values, { silent: true })
      .then(unwrap),
    onSuccess: (resource, variables) => {
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.detail(variables.sessionId) });
      void queryClient.invalidateQueries({ queryKey: reportChatbiKeys.messages(variables.sessionId) });
      if (resource.resourceType === 'dataset') {
        void queryClient.invalidateQueries({ queryKey: reportDatasetKeys.all });
      } else {
        void queryClient.invalidateQueries({ queryKey: reportDashboardKeys.all });
      }
    },
  });
}
