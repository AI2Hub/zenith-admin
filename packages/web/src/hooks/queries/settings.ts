import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { resourceKeyOf } from '@zenith/shared/core';
import {
  settingsContract,
  settingsGetOp,
  settingsHistoryOps,
  settingsUpdateOp,
  type SettingsEnvelope,
  type SettingsGetOperation,
  type SettingsModuleKey,
  type SettingsUpdateOperation,
} from '@zenith/shared/settings';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

/**
 * 运行时设置（/api/settings）域 hooks。
 *
 * key 树以契约 basePath 派生的资源键 `settings` 为根：
 * - `['settings', 'getXxx']`：某模块的读取信封（生效值 / 上级值 / 覆盖路径 / 版本）
 * - `['settings', 'me']`：登录用户投影（布局开关、密码规则、终端录屏…），布局与多个页面共用一次请求
 * - `['settings', 'public', { tenantCode }]`：匿名投影（登录 / 注册页）
 * - `['settings', 'list']`：通用设置页的模块清单
 * 保存某模块后：直接写回该模块信封（写接口与读接口同源），并失效 me / public / list——
 * 它们都是同一份数据的投影，而不是别的域。
 */
export const settingsKeys = {
  all: [resourceKeyOf(settingsContract.basePath)] as const,
  list: contractKey(settingsContract.list),
  me: contractKey(settingsContract.me),
  publicPrefix: contractKey(settingsContract.public),
  public: (tenantCode?: string) => contractKey(settingsContract.public, { query: { tenantCode: tenantCode || undefined } }),
  module: (module: SettingsModuleKey) => contractKey(settingsGetOp(module)),
  versions: (module: SettingsModuleKey) => contractKey(settingsHistoryOps(module).list),
  history: (module: SettingsModuleKey) => [resourceKeyOf(settingsHistoryOps(module).basePath)] as const,
};

/** 泛型调用点用参数化操作类型保住 `SettingsEnvelope<M>`；运行时仍是契约上的原操作 */
const getOp = <M extends SettingsModuleKey>(module: M) => settingsGetOp(module) as unknown as SettingsGetOperation<M>;
const updateOp = <M extends SettingsModuleKey>(module: M) => settingsUpdateOp(module) as unknown as SettingsUpdateOperation<M>;

/** 某模块的读取信封；`enabled` 用于按权限跳过请求 */
export function useSettings<M extends SettingsModuleKey>(module: M, enabled = true) {
  return useApiQuery(getOp(module), { enabled });
}

export function invalidateSettingsProjections(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: settingsKeys.me });
  void qc.invalidateQueries({ queryKey: settingsKeys.publicPrefix });
  void qc.invalidateQueries({ queryKey: settingsKeys.list });
}

/**
 * 保存与恢复使用同一缓存写入链路，领域联动不受页面入口影响。
 */
export function applySettingsSaved<M extends SettingsModuleKey>(qc: QueryClient, module: M, saved: SettingsEnvelope<M>) {
  const previous = qc.getQueryData<SettingsEnvelope<M>>(settingsKeys.module(module));
  // settings hooks 同时服务登录 / 布局；业务联动仅在实际保存时加载，避免扩大首屏依赖。
  void import('./settings-effects').then(({ invalidateSettingsEffects }) => {
    invalidateSettingsEffects(qc, module, saved, previous);
  }).catch(() => {
    // 网络中断导致联动 chunk 加载失败时，仍使已有查询失效，避免展示陈旧业务数据。
    void qc.invalidateQueries();
  });
  qc.setQueryData(settingsKeys.module(module), saved);
  // v0 与包含 v0 的比较依赖当前继承值，不能按不可变历史永久缓存。
  void qc.invalidateQueries({ queryKey: settingsKeys.history(module) });
  invalidateSettingsProjections(qc);
}

export function useSaveSettings<M extends SettingsModuleKey>(
  module: M,
  /** 先于缓存回填执行：此时 qc.getQueryData(settingsKeys.module(module)) 仍是保存前的信封，可与 saved 比对决定波及范围 */
  extraInvalidate?: (qc: QueryClient, saved: SettingsEnvelope<M>) => void,
) {
  return useApiMutation(updateOp(module), {
    invalidate: (qc, saved) => {
      extraInvalidate?.(qc, saved);
      applySettingsSaved(qc, module, saved);
    },
  });
}

/** 历史记录不可变；分页时保留上一页，写入仅刷新历史清单。 */
export function useSettingsVersions(module: SettingsModuleKey, page: number, pageSize: number, enabled = true) {
  return useApiQuery(settingsHistoryOps(module).list, { query: { page, pageSize } }, { enabled, placeholderData: keepPreviousData });
}

export function useSettingsVersion(module: SettingsModuleKey, version: number, enabled = true) {
  return useApiQuery(settingsHistoryOps(module).detail, { params: { version } }, { enabled });
}

export function useSettingsComparison(module: SettingsModuleKey, from: number, to: number, enabled = true) {
  return useApiQuery(settingsHistoryOps(module).compare, { query: { from, to } }, { enabled });
}

export function useSettingsRestorePreview(module: SettingsModuleKey) {
  return useApiMutation(settingsHistoryOps(module).preview);
}

export function useRestoreSettings<M extends SettingsModuleKey>(module: M) {
  return useApiMutation(settingsHistoryOps(module).restore, {
    invalidate: (qc, saved) => applySettingsSaved(qc, module, saved as SettingsEnvelope<M>),
  });
}

/** 登录用户可见的设置投影：布局（水印 / 快捷聊天 / 反馈入口）、密码规则、终端录屏、规则审批开关 */
export function useMySettings(enabled = true) {
  return useApiQuery(settingsContract.me, { enabled, staleTime: LOOKUP_STALE_TIME, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', requestOptions: { silent: true } });
}

/** 匿名投影（登录 / 注册页）；多租户模式下随租户编码变化 */
export function usePublicSettings(tenantCode?: string) {
  return useApiQuery(settingsContract.public, { query: { tenantCode: tenantCode || undefined } }, { staleTime: LOOKUP_STALE_TIME, requestOptions: { silent: true } });
}

/** 当前用户可读的设置模块清单（通用设置页导航） */
export function useSettingsModules() {
  return useApiQuery(settingsContract.list);
}
