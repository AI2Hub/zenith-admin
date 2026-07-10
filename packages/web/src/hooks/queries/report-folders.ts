import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportFolderInput,
  MoveReportFolderInput,
  ReportFolder,
  ReportFolderTreeNode,
  ReportResourceType,
  UpdateReportFolderInput,
} from '@zenith/shared';
import { LOOKUP_STALE_TIME, toQueryString, unwrap } from '@/lib/query';
import { request } from '@/utils/request';

export interface ReportFolderListParams {
  resourceType?: ReportResourceType;
}

export const reportFolderKeys = {
  all: ['report', 'folders'] as const,
  lists: ['report', 'folders', 'list'] as const,
  list: (params: ReportFolderListParams) => ['report', 'folders', 'list', params] as const,
  detail: (id: number | undefined) => ['report', 'folders', 'detail', id] as const,
};

export function useReportFolderTree(params: ReportFolderListParams = {}, enabled = true) {
  return useQuery({
    queryKey: reportFolderKeys.list(params),
    queryFn: () => request.get<ReportFolderTreeNode[]>(`/api/report/folders/tree${toQueryString(params)}`).then(unwrap),
    staleTime: LOOKUP_STALE_TIME,
    enabled,
  });
}

export function useReportFolderDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: reportFolderKeys.detail(id),
    queryFn: () => request.get<ReportFolder>(`/api/report/folders/${id}`).then(unwrap),
    enabled: enabled && !!id,
  });
}

export function flattenReportFolders(nodes: ReportFolderTreeNode[]): ReportFolderTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenReportFolders(node.children ?? [])]);
}

export function useSaveReportFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: CreateReportFolderInput | UpdateReportFolderInput }) =>
      (id
        ? request.put<ReportFolder>(`/api/report/folders/${id}`, values, { silent: true })
        : request.post<ReportFolder>('/api/report/folders', values, { silent: true })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportFolderKeys.all }),
  });
}

export function useMoveReportFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: MoveReportFolderInput }) =>
      request.post<ReportFolder>(`/api/report/folders/${id}/move`, values, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportFolderKeys.all }),
  });
}

export function useDeleteReportFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request.delete<null>(`/api/report/folders/${id}`, undefined, { silent: true }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportFolderKeys.all }),
  });
}
