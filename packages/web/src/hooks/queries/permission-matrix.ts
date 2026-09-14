import { apiCatalogContract, permissionMatrixContract } from '@zenith/shared/identity';
import { contractKey, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

export const apiCatalogKeys = {
  list: contractKey(apiCatalogContract.list),
};

/**
 * 接口目录：服务端从契约派生（前端不 import 契约聚合，避免各域契约进共享分包）。
 * 目录只随发布变化，进程内视为不过期；页面「查询」按标准列表语义回源，刷新即拿到新版本。
 */
export function useApiCatalog() {
  return useApiQuery(apiCatalogContract.list, { staleTime: Infinity });
}

/**
 * 权限矩阵的数据面：只取「主体持有哪些权限码」，判定在浏览器内用 judgeOperation 完成。
 */
export function useRolePermissionSets(enabled = true) {
  return useApiQuery(permissionMatrixContract.roles, { enabled, staleTime: LOOKUP_STALE_TIME });
}

export function useUserPermissionSet(userId: number | null) {
  return useApiQuery(permissionMatrixContract.user, { params: { id: userId ?? 0 } }, { enabled: userId != null, staleTime: LOOKUP_STALE_TIME });
}
