import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { resourceKeyOf } from '@zenith/shared/core';
import {
  settingsContract,
  settingsGetOp,
  settingsUpdateOp,
  type SettingsEnvelope,
  type SettingsGetOperation,
  type SettingsUpdateOperation,
} from '@zenith/shared/settings/contracts';
import { settingsHistoryBasePath, type SettingsModuleKey } from '@zenith/shared/settings/registry';
import { contractKey, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { settingsProjectionKeys } from './settings-projections';

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
  ...settingsProjectionKeys,
  module: (module: SettingsModuleKey) => contractKey(settingsGetOp(module)),
  history: (module: SettingsModuleKey) => [resourceKeyOf(settingsHistoryBasePath(module))] as const,
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
export async function applySettingsSaved<M extends SettingsModuleKey>(qc: QueryClient, module: M, saved: SettingsEnvelope<M>) {
  const previous = qc.getQueryData<SettingsEnvelope<M>>(settingsKeys.module(module));
  // 保存前发出的旧读取不能在写回新版本后重新覆盖当前信封。
  void qc.cancelQueries({ queryKey: settingsKeys.module(module), exact: true });
  qc.setQueryData(settingsKeys.module(module), saved);
  // v0 与包含 v0 的比较依赖当前继承值，不能按不可变历史永久缓存。
  void qc.invalidateQueries({ queryKey: settingsKeys.history(module) });
  invalidateSettingsProjections(qc);
  try {
    const { invalidateSettingsEffects } = await import('./settings-effects');
    invalidateSettingsEffects(qc, module, saved, previous);
  } catch {
    // 联动资源加载失败时使已有查询失效，防止展示陈旧业务数据。
    void qc.invalidateQueries();
  }
}

export function useSaveSettings<M extends SettingsModuleKey>(
  module: M,
  /** 先于缓存回填执行：此时 qc.getQueryData(settingsKeys.module(module)) 仍是保存前的信封，可与 saved 比对决定波及范围 */
  extraInvalidate?: (qc: QueryClient, saved: SettingsEnvelope<M>) => void,
) {
  const qc = useQueryClient();
  return useApiMutation(updateOp(module), {
    onSuccess: (saved) => {
      extraInvalidate?.(qc, saved);
      return applySettingsSaved(qc, module, saved);
    },
  });
}

/** 当前用户可读的设置模块清单（通用设置页导航） */
export function useSettingsModules() {
  return useApiQuery(settingsContract.list);
}
