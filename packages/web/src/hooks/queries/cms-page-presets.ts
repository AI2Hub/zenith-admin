import type { QueryClient } from '@tanstack/react-query';
import { cmsPagePresetContract } from '@zenith/shared/cms';
import { contractKey, useApiMutation, useApiQuery, useSaveMutation } from '@/lib/contract-query';

// 预设是不分页的版本库；详情返回快照，与列表元数据有不同生命周期。
export const cmsPagePresetKeys = {
  list: (siteId: number) => contractKey(cmsPagePresetContract.list, { query: { siteId } }),
  detail: (id: number) => contractKey(cmsPagePresetContract.detail, { params: { id } }),
  versions: (id: number) => contractKey(cmsPagePresetContract.versions, { params: { id } }),
  version: (id: number, version: number) => contractKey(cmsPagePresetContract.version, { params: { id, version } }),
  usages: (id: number) => contractKey(cmsPagePresetContract.usages, { params: { id } }),
};

/** 页面保存 / 删除会改变预设的使用位置，预设自身的快照不受影响。 */
export function invalidateCmsPagePresetUsages(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: contractKey(cmsPagePresetContract.usages) });
}

export function useCmsPagePresets(siteId?: number, enabled = true) {
  return useApiQuery(cmsPagePresetContract.list, { query: { siteId: siteId ?? 0 } }, { enabled: enabled && !!siteId });
}

export function useCmsPagePresetDetail(id?: number, enabled = true) {
  return useApiQuery(cmsPagePresetContract.detail, { params: { id: id ?? 0 } }, { enabled: enabled && !!id });
}

export function useCmsPagePresetVersions(id?: number, enabled = true) {
  return useApiQuery(cmsPagePresetContract.versions, { params: { id: id ?? 0 } }, { enabled: enabled && !!id });
}

export function useCmsPagePresetVersion(id?: number, version?: number, enabled = true) {
  return useApiQuery(cmsPagePresetContract.version, { params: { id: id ?? 0, version: version ?? 0 } }, {
    enabled: enabled && !!id && !!version,
    // 版本快照不可变，保存新版本只失效最新详情和版本目录。
    staleTime: Infinity,
  });
}

export function useCmsPagePresetUsages(id?: number, enabled = true) {
  return useApiQuery(cmsPagePresetContract.usages, { params: { id: id ?? 0 } }, { enabled: enabled && !!id });
}

export function useSaveCmsPagePreset() {
  return useSaveMutation(cmsPagePresetContract.create, cmsPagePresetContract.saveVersion, {
    invalidate: (qc, saved) => {
      void qc.invalidateQueries({ queryKey: cmsPagePresetKeys.list(saved.siteId) });
      void qc.invalidateQueries({ queryKey: cmsPagePresetKeys.detail(saved.id) });
      void qc.invalidateQueries({ queryKey: cmsPagePresetKeys.versions(saved.id) });
      // 使用页块仍保持旧快照，但 latestVersion / canUpgrade 已变化。
      void qc.invalidateQueries({ queryKey: cmsPagePresetKeys.usages(saved.id) });
    },
  });
}

export function useCopyCmsPagePreset() {
  return useApiMutation(cmsPagePresetContract.copy, {
    invalidate: (qc, saved) => { void qc.invalidateQueries({ queryKey: cmsPagePresetKeys.list(saved.siteId) }); },
  });
}

/** 只生成待插入的草稿区块；由页面搭建器统一保存，不提前改动使用记录。 */
export function useInstantiateCmsPagePreset() {
  return useApiMutation(cmsPagePresetContract.instantiate);
}
