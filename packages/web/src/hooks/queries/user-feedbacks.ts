import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, UserFeedback, UserFeedbackCategory, UserFeedbackStatus } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface UserFeedbackListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  category?: UserFeedbackCategory;
  status?: UserFeedbackStatus;
  startTime?: string;
  endTime?: string;
}

export const userFeedbackKeys = {
  all: ['user-feedbacks'] as const,
  lists: ['user-feedbacks', 'list'] as const,
  list: (params: UserFeedbackListParams) => ['user-feedbacks', 'list', params] as const,
  detail: (id: number | undefined) => ['user-feedbacks', 'detail', id] as const,
};

export function useUserFeedbackList(params: UserFeedbackListParams) {
  return useQuery({
    queryKey: userFeedbackKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<UserFeedback>>(`/api/feedbacks${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export interface SubmitFeedbackValues {
  score?: number | null;
  category: UserFeedbackCategory;
  content?: string | null;
  pagePath?: string | null;
}

/** 提交意见反馈（所有登录用户可用） */
export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: SubmitFeedbackValues) =>
      request.post<UserFeedback>('/api/feedbacks', values).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userFeedbackKeys.all }),
  });
}

export interface HandleFeedbackValues {
  status: UserFeedbackStatus;
  handleRemark?: string | null;
}

/** 处理反馈（更新状态与备注） */
export function useHandleFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: HandleFeedbackValues }) =>
      request.put<UserFeedback>(`/api/feedbacks/${id}/handle`, values).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userFeedbackKeys.all }),
  });
}

/** 删除：单个（length===1 走单删接口）或批量 */
export function useDeleteFeedbacks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      (ids.length === 1
        ? request.delete<null>(`/api/feedbacks/${ids[0]}`)
        : request.delete<null>('/api/feedbacks/batch', { ids })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userFeedbackKeys.all }),
  });
}
