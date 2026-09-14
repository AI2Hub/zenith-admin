import { permissionMatrixContract } from '@zenith/shared/identity';
import { useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

/**
 * 接口目录 → 权限矩阵 Tab 的数据面：只取「主体持有哪些权限码」，
 * 「接口需要什么权限」由 `@zenith/shared/permission-catalog` 在浏览器内从契约派生。
 */
export function useRolePermissionSets(enabled = true) {
  return useApiQuery(permissionMatrixContract.roles, { enabled, staleTime: LOOKUP_STALE_TIME });
}

export function useUserPermissionSet(userId: number | null) {
  return useApiQuery(permissionMatrixContract.user, { params: { id: userId ?? 0 } }, { enabled: userId != null, staleTime: LOOKUP_STALE_TIME });
}
