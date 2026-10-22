import { authContract } from '@zenith/shared/identity';
import { defaultPreferences, resolvePreferences } from '@zenith/shared/preferences';
import { settingsProjectionContract } from '@zenith/shared/settings/projections';
import { useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';
import { approvalRequest } from './approval-request';

const queryOptions = {
  staleTime: LOOKUP_STALE_TIME,
  // 离开登录后的路由即移除个人数据，避免同一轻页切换账号时复用前一个人的偏好。
  gcTime: 0,
  retry: false,
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
  requestOptions: { client: approvalRequest, silent: true },
} as const;

/** 轻页只读取布局所需的偏好；两个请求并行，不装配后台 Provider 和 WebSocket。 */
export function useApprovalMultiSelectLayout() {
  const personal = useApiQuery(authContract.preferences, queryOptions);
  const settings = useApiQuery(settingsProjectionContract.me, queryOptions);
  // 系统策略未知时不提前采用个人覆盖，避免临时绕过系统锁定。
  return settings.data
    ? resolvePreferences(settings.data.ui.preferences, personal.data?.overrides ?? {}).multiSelectLayout
    : defaultPreferences.multiSelectLayout;
}
