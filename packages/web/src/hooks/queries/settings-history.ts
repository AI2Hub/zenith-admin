import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { settingsHistoryOps } from '@zenith/shared/settings/history-contracts';
import type { SettingsEnvelope } from '@zenith/shared/settings/contracts';
import type { SettingsModuleKey } from '@zenith/shared/settings/registry';
import { useApiMutation, useApiQuery } from '@/lib/contract-query';
import { applySettingsSaved } from './settings';

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
  const qc = useQueryClient();
  return useApiMutation(settingsHistoryOps(module).restore, {
    onSuccess: (saved) => applySettingsSaved(qc, module, saved as SettingsEnvelope<M>),
  });
}
