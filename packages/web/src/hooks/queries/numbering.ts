import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import type { QueryOf } from '@zenith/shared/core';
import { numberingAllocationContract, numberingDefaultContract, numberingRuleContract, type NumberingSceneCode } from '@zenith/shared/platform';
import { contractKey, createResourceQueries, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

export const {
  keys: numberingRuleKeys,
  useList: useNumberingRuleList,
  useDetail: useNumberingRuleDetail,
  useSave: useSaveNumberingRule,
  useDelete: useDeleteNumberingRules,
} = createResourceQueries(numberingRuleContract, {
  // 默认规则与使用位置展示规则派生信息，保存后一起回源。
  onSaved: qc => {
    void qc.invalidateQueries({ queryKey: contractKey(numberingDefaultContract.list) });
    void qc.invalidateQueries({ queryKey: contractKey(numberingRuleContract.usages) });
  },
  onDeleted: (qc, ids) => {
    void qc.invalidateQueries({ queryKey: contractKey(numberingDefaultContract.list) });
    for (const id of ids) {
      qc.removeQueries({ queryKey: contractKey(numberingRuleContract.versions, { params: { id } }) });
      qc.removeQueries({ queryKey: contractKey(numberingRuleContract.counters, { params: { id } }) });
      qc.removeQueries({ queryKey: contractKey(numberingRuleContract.usages, { params: { id } }) });
    }
  },
});

export const numberingKeys = {
  scenes: contractKey(numberingRuleContract.scenes),
  versions: (id: number) => contractKey(numberingRuleContract.versions, { params: { id } }),
  counters: (id: number) => contractKey(numberingRuleContract.counters, { params: { id } }),
  defaults: contractKey(numberingDefaultContract.list),
  usages: (id: number) => contractKey(numberingRuleContract.usages, { params: { id } }),
  allocations: contractKey(numberingAllocationContract.list),
};

export const useNumberingScenes = () => useApiQuery(numberingRuleContract.scenes, { staleTime: LOOKUP_STALE_TIME });

/** 规则拥有自己的下拉缓存；发布、停用和删除都会使所有场景的选项回源。 */
export const useNumberingRuleOptions = (scene?: NumberingSceneCode, enabled = true) =>
  useApiQuery(numberingRuleContract.all, { query: { scene } }, { enabled, staleTime: LOOKUP_STALE_TIME });

export const useNumberingVersions = (id?: number, enabled = true) =>
  useApiQuery(numberingRuleContract.versions, { params: { id: id ?? 0 } }, { enabled: enabled && id !== undefined });

export const useNumberingCounters = (id?: number, enabled = true) =>
  useApiQuery(numberingRuleContract.counters, { params: { id: id ?? 0 } }, { enabled: enabled && id !== undefined });

export function usePublishNumberingRule() {
  return useApiMutation(numberingRuleContract.publish, {
    invalidate: (qc, _rule, { params }) => {
      void qc.invalidateQueries({ queryKey: numberingRuleKeys.lists });
      void qc.invalidateQueries({ queryKey: numberingRuleKeys.detail(params.id) });
      void qc.invalidateQueries({ queryKey: numberingRuleKeys.lookup });
      void qc.invalidateQueries({ queryKey: numberingKeys.versions(params.id) });
      // 发布只新增版本，不改变已固定的默认规则、流程版本及历史分配记录。
    },
  });
}

export const useNumberingDefaults = (enabled = true) =>
  useApiQuery(numberingDefaultContract.list, { enabled });

export const useNumberingRuleUsages = (id?: number, enabled = true) =>
  useApiQuery(numberingRuleContract.usages, { params: { id: id ?? 0 } }, { enabled: enabled && id !== undefined });

function invalidateDefaults(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: numberingKeys.defaults });
  // 更换规则后旧规则与新规则的使用位置都可能变化。
  void qc.invalidateQueries({ queryKey: contractKey(numberingRuleContract.usages) });
}

export const useUpdateNumberingDefault = () => useApiMutation(numberingDefaultContract.update, { invalidate: invalidateDefaults });
export const useResetNumberingDefault = () => useApiMutation(numberingDefaultContract.reset, { invalidate: invalidateDefaults });

export const useNumberingAllocations = (query: QueryOf<typeof numberingAllocationContract.list>, enabled = true) =>
  useApiQuery(numberingAllocationContract.list, { query }, { enabled, placeholderData: keepPreviousData });
