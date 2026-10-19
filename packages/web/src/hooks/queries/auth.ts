import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { authContract, type User } from '@zenith/shared/identity';
import { api } from '@/lib/contract-query';
import { ApiError, LOOKUP_STALE_TIME } from '@/lib/query';

export interface AuthSession {
  user: User;
  permissions: string[];
  permissionBoundaryAt?: string | null;
}

export class AuthRejectedError extends ApiError {
  constructor(message = '登录状态已失效') {
    super(401, message);
    this.name = 'AuthRejectedError';
  }
}

export const authKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

export function authSessionQueryOptions() {
  return queryOptions({
    queryKey: authKeys.me,
    queryFn: async ({ signal }): Promise<AuthSession> => {
      try {
        const { permissions, permissionBoundaryAt, ...user } = await api(authContract.me, { silent: true, signal });
        return { user, permissions: permissions ?? [], permissionBoundaryAt };
      } catch (err) {
        // 401 单独成类：消费方据此区分「登录态失效」与其它接口错误
        if (err instanceof ApiError && err.code === 401) throw new AuthRejectedError(err.message);
        throw err;
      }
    },
    staleTime: LOOKUP_STALE_TIME,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function updateCachedAuthUser(queryClient: QueryClient, user: User): void {
  queryClient.setQueryData<AuthSession>(authKeys.me, (current) => {
    if (!current || current.user.id !== user.id) return current;
    return { ...current, user };
  });
}
