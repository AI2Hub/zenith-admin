import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, UserGroup } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface UserGroupListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

export interface GroupMember {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  joinedAt: string;
}

export const userGroupKeys = {
  all: ['user-groups'] as const,
  lists: ['user-groups', 'list'] as const,
  list: (params: UserGroupListParams) => ['user-groups', 'list', params] as const,
  detail: (id: number | undefined) => ['user-groups', 'detail', id] as const,
  members: (id: number | undefined) => ['user-groups', 'members', id] as const,
  roles: (id: number | undefined) => ['user-groups', 'roles', id] as const,
};

export function useUserGroupList(params: UserGroupListParams) {
  return useQuery({
    queryKey: userGroupKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<UserGroup>>(`/api/user-groups${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useUserGroupDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: userGroupKeys.detail(id),
    queryFn: () => request.get<UserGroup>(`/api/user-groups/${id}`).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

export function useUserGroupMembers(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: userGroupKeys.members(id),
    queryFn: () => request.get<GroupMember[]>(`/api/user-groups/${id}/members`).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

export function useSaveUserGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Partial<UserGroup> }) =>
      (id === undefined ? request.post<UserGroup>('/api/user-groups', values) : request.put<UserGroup>(`/api/user-groups/${id}`, values)).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userGroupKeys.all }),
  });
}

export function useDeleteUserGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      (ids.length === 1 ? request.delete<null>(`/api/user-groups/${ids[0]}`) : request.delete<null>('/api/user-groups/batch', { ids })).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userGroupKeys.all }),
  });
}

export function useAssignUserGroupMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: number; userIds: number[] }) =>
      request.put<null>(`/api/user-groups/${id}/members`, { userIds }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: userGroupKeys.all }),
  });
}

export interface UserGroupRole {
  id: number;
  name: string;
  code: string;
  status: 'enabled' | 'disabled';
}

export function useUserGroupRoles(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: userGroupKeys.roles(id),
    queryFn: () => request.get<UserGroupRole[]>(`/api/user-groups/${id}/roles`).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

export function useAssignUserGroupRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleIds }: { id: number; roleIds: number[] }) =>
      request.put<null>(`/api/user-groups/${id}/roles`, { roleIds }).then(unwrap),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userGroupKeys.all });
      // 组角色变化影响成员的继承权限展示
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
