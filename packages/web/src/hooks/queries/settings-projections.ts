import { settingsProjectionContract } from '@zenith/shared/settings/projections';
import { contractKey, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

export const settingsProjectionKeys = {
  me: contractKey(settingsProjectionContract.me),
  publicPrefix: contractKey(settingsProjectionContract.public),
  public: (tenantCode?: string) => contractKey(settingsProjectionContract.public, { query: { tenantCode: tenantCode || undefined } }),
};

/** 登录用户可见的设置投影：布局（水印 / 快捷聊天 / 反馈入口）、密码规则、终端录屏、规则审批开关 */
export function useMySettings(enabled = true) {
  return useApiQuery(settingsProjectionContract.me, { enabled, staleTime: LOOKUP_STALE_TIME, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', requestOptions: { silent: true } });
}

/** 匿名投影（登录 / 注册页）；多租户模式下随租户编码变化 */
export function usePublicSettings(tenantCode?: string) {
  return useApiQuery(settingsProjectionContract.public, { query: { tenantCode: tenantCode || undefined } }, { staleTime: LOOKUP_STALE_TIME, requestOptions: { silent: true } });
}
