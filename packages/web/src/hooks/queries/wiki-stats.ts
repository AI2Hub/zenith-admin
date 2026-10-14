import { wikiStatsContract } from '@zenith/shared/wiki';
import { useSaveSettings, useSettings } from './settings';
import { useApiQuery } from '@/lib/contract-query';

export { wikiStatsKeys } from './wiki-query-keys';

export function useWikiStatsOverview() {
  return useApiQuery(wikiStatsContract.overview);
}

export function useWikiHotDocs(limit = 10) {
  return useApiQuery(wikiStatsContract.hotDocs, { query: { limit } });
}

export function useWikiContributors(limit = 10) {
  return useApiQuery(wikiStatsContract.contributors, { query: { limit } });
}

export function useWikiStaleDocs(limit = 10) {
  return useApiQuery(wikiStatsContract.staleDocs, { query: { limit } });
}

export function useWikiOpsStats() {
  return useApiQuery(wikiStatsContract.ops);
}

/** 知识库全局设置由运行时设置 wiki 模块承载（/api/settings/wiki）；返回读取信封（effective / inherited / version） */
export function useWikiSettings() {
  return useSettings('wiki');
}

/** 保存和历史恢复的文档、治理与运营统计联动统一由 settings hooks 处理。 */
export function useUpdateWikiSettings() {
  return useSaveSettings('wiki');
}
