import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import type { QueryOf } from '@zenith/shared/core';
import { numberingAllocationContract, numberingBindingContract, numberingRuleContract, type NumberingSceneCode } from '@zenith/shared/platform';
import { contractKey, createResourceQueries, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { LOOKUP_STALE_TIME } from '@/lib/query';

export const {
  keys: numberingRuleKeys,
  useList: useNumberingRuleList,
  useDetail: useNumberingRuleDetail,
  useSave: useSaveNumberingRule,
  useDelete: useDeleteNumberingRules,
} = createResourceQueries(numberingRuleContract, {
  // 绑定列表展示规则名称，重命名必须同时刷新其派生列。
  onSaved: qc => { void qc.invalidateQueries({ queryKey: contractKey(numberingBindingContract.list) }); },
  onDeleted: (qc, ids) => {
    for (const id of ids) {
      qc.removeQueries({ queryKey: contractKey(numberingRuleContract.versions, { params: { id } }) });
      qc.removeQueries({ queryKey: contractKey(numberingRuleContract.counters, { params: { id } }) });
    }
  },
});

export const numberingKeys = {
  scenes: contractKey(numberingRuleContract.scenes),
  versions: (id: number) => contractKey(numberingRuleContract.versions, { params: { id } }),
  counters: (id: number) => contractKey(numberingRuleContract.counters, { params: { id } }),
  bindings: contractKey(numberingBindingContract.list),
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
      // 发布只新增版本，不改变已固定的业务绑定及历史分配记录。
    },
  });
}

export const useNumberingBindings = (query: QueryOf<typeof numberingBindingContract.list>, enabled = true) =>
  useApiQuery(numberingBindingContract.list, { query }, { enabled, placeholderData: keepPreviousData });

function invalidateBindings(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: numberingKeys.bindings });
}

export const useUpsertNumberingBinding = () => useApiMutation(numberingBindingContract.upsert, { invalidate: invalidateBindings });
export const useRemoveNumberingBinding = () => useApiMutation(numberingBindingContract.remove, { invalidate: invalidateBindings });

export const useNumberingAllocations = (query: QueryOf<typeof numberingAllocationContract.list>, enabled = true) =>
  useApiQuery(numberingAllocationContract.list, { query }, { enabled, placeholderData: keepPreviousData });
