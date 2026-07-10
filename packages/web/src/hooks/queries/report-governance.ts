import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportEnvironmentInput,
  CreateReportEnvironmentPromotionInput,
  CreateReportPublishApprovalInput,
  CreateReportResourceTransferInput,
  DecideReportPublishApprovalInput,
  DecideReportResourceTransferInput,
  GrantReportResourceAclInput,
  PaginatedResponse,
  ReportAclRole,
  ReportApprovalStatus,
  ReportEnvironment,
  ReportEnvironmentPromotion,
  ReportEnvironmentPromotionActionInput,
  ReportPromotionStatus,
  ReportPublishApproval,
  ReportResourceAcl,
  ReportResourceTransfer,
  ReportResourceType,
  ReportTransferStatus,
  UpdateReportEnvironmentInput,
  UpdateReportResourceAclInput,
} from '@zenith/shared';
import { toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export interface ReportResourceRef {
  resourceType: ReportResourceType;
  resourceId: number;
}

export const reportAclKeys = {
  all: ['report', 'governance', 'acls'] as const,
  lists: ['report', 'governance', 'acls', 'list'] as const,
  list: (params: ReportResourceRef & { inheritFromFolder?: boolean }) => ['report', 'governance', 'acls', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'governance', 'acls', 'detail', id] as const,
};

export function useReportResourceAcls(params: ReportResourceRef & { inheritFromFolder?: boolean }, enabled = true) {
  return useQuery({
    queryKey: reportAclKeys.list(params),
    queryFn: () => request.get<ReportResourceAcl[]>(`/api/report/governance/acls${toQueryString(params)}`).then(unwrap),
    enabled: enabled && params.resourceId > 0,
  });
}

export function useGrantReportResourceAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: GrantReportResourceAclInput) => request.post<ReportResourceAcl>('/api/report/governance/acls', values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAclKeys.all }),
  });
}

export function useUpdateReportResourceAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: UpdateReportResourceAclInput }) =>
      request.put<ReportResourceAcl>(`/api/report/governance/acls/${id}`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAclKeys.all }),
  });
}

export function useRevokeReportResourceAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/governance/acls/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportAclKeys.all }),
  });
}

export function useCheckReportResourceAccess() {
  return useMutation({
    mutationFn: (values: ReportResourceRef & { requiredRole: ReportAclRole }) =>
      request.post<{ allowed: boolean; requiredRole: ReportAclRole }>('/api/report/governance/access/check', values, { silent: true }).then(unwrap),
  });
}

export interface GovernanceListParams {
  page: number;
  pageSize: number;
  resourceType?: ReportResourceType;
}

export const reportApprovalKeys = {
  all: ['report', 'governance', 'approvals'] as const,
  lists: ['report', 'governance', 'approvals', 'list'] as const,
  list: (params: GovernanceListParams & { status?: ReportApprovalStatus }) => ['report', 'governance', 'approvals', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'governance', 'approvals', 'detail', id] as const,
};

export function useReportApprovalList(params: GovernanceListParams & { status?: ReportApprovalStatus }) {
  return useQuery({
    queryKey: reportApprovalKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportPublishApproval>>(`/api/report/governance/approvals${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReportApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateReportPublishApprovalInput) => request.post<ReportPublishApproval>('/api/report/governance/approvals', values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportApprovalKeys.all }),
  });
}

export function useDecideReportApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: DecideReportPublishApprovalInput }) =>
      request.post<ReportPublishApproval>(`/api/report/governance/approvals/${id}/decision`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportApprovalKeys.all }),
  });
}

export function useCancelReportApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      request.post<ReportPublishApproval>(`/api/report/governance/approvals/${id}/cancel`, reason ? { reason } : {}, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportApprovalKeys.all }),
  });
}

export const reportTransferKeys = {
  all: ['report', 'governance', 'transfers'] as const,
  lists: ['report', 'governance', 'transfers', 'list'] as const,
  list: (params: GovernanceListParams & { status?: ReportTransferStatus }) => ['report', 'governance', 'transfers', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'governance', 'transfers', 'detail', id] as const,
};

export function useReportTransferList(params: GovernanceListParams & { status?: ReportTransferStatus }) {
  return useQuery({
    queryKey: reportTransferKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportResourceTransfer>>(`/api/report/governance/transfers${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReportTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateReportResourceTransferInput) => request.post<ReportResourceTransfer>('/api/report/governance/transfers', values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportTransferKeys.all }),
  });
}

export function useDecideReportTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: DecideReportResourceTransferInput }) =>
      request.post<ReportResourceTransfer>(`/api/report/governance/transfers/${id}/decision`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportTransferKeys.all }),
  });
}

export function useCancelReportTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      request.post<ReportResourceTransfer>(`/api/report/governance/transfers/${id}/cancel`, reason ? { reason } : {}, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportTransferKeys.all }),
  });
}

export const reportEnvironmentKeys = {
  all: ['report', 'environments'] as const,
  lists: ['report', 'environments', 'list'] as const,
  list: (params: Record<string, never>) => ['report', 'environments', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'environments', 'detail', id] as const,
};

export function useReportEnvironmentList() {
  return useQuery({
    queryKey: reportEnvironmentKeys.list({}),
    queryFn: () => request.get<ReportEnvironment[]>('/api/report/environments').then(unwrap),
  });
}

export function useSaveReportEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportEnvironmentInput | UpdateReportEnvironmentInput }) =>
      (id
        ? request.put<ReportEnvironment>(`/api/report/environments/${id}`, values, { silent: true })
        : request.post<ReportEnvironment>('/api/report/environments', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportEnvironmentKeys.all }),
  });
}

export function useDeleteReportEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/environments/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportEnvironmentKeys.all }),
  });
}

export const reportPromotionKeys = {
  all: ['report', 'environments', 'promotions'] as const,
  lists: ['report', 'environments', 'promotions', 'list'] as const,
  list: (params: GovernanceListParams & { status?: ReportPromotionStatus }) => ['report', 'environments', 'promotions', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'environments', 'promotions', 'detail', id] as const,
};

export function useReportPromotionList(params: GovernanceListParams & { status?: ReportPromotionStatus }) {
  return useQuery({
    queryKey: reportPromotionKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<ReportEnvironmentPromotion>>(`/api/report/environments/promotions${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReportPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateReportEnvironmentPromotionInput) => request.post<ReportEnvironmentPromotion>('/api/report/environments/promotions', values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportPromotionKeys.all }),
  });
}

export function useTransitionReportPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: ReportEnvironmentPromotionActionInput }) =>
      request.post<ReportEnvironmentPromotion>(`/api/report/environments/promotions/${id}/transition`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportPromotionKeys.all }),
  });
}
