import { useMemo } from 'react';
import { compactParams, type CompactParams } from '@/lib/query';

/**
 * 已提交筛选 → 契约查询参数。
 *
 * `compactParams` 丢弃 `undefined` / `null` / 空串、保留 `0` / `false`，随后按**内容**缓存引用：
 * 同一组值在多次渲染间返回同一对象，可直接展开进 `useXxxList({ page, pageSize, ...filterQuery })`、
 * 传给 `<ExportButton query={filterQuery} />` 或进入 query key。
 *
 * 取代页面里的 `useMemo(() => compactParams({ … }), [submittedParams])`：不再手写依赖数组，
 * 映射里引用的任何外部值（当前站点、勾选开关…）变化都会自然反映到结果，没有过期闭包；
 * 查询参数只含 JSON 标量 / 数组，按序列化比较的成本可忽略。
 *
 * @example
 * const filterQuery = useFilterQuery({
 *   keyword: submittedParams.keyword,
 *   status: enumValueOf(XXX_STATUSES, submittedParams.status),
 *   ...formatDateTimeRangeForApi(submittedParams.timeRange),
 * });
 */
export function useFilterQuery<T extends Record<string, unknown>>(params: T): CompactParams<T> {
  const compacted = compactParams(params);
  const key = JSON.stringify(compacted);
  // 依赖即内容快照：key 不变时沿用上一次的对象，保证引用稳定
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => compacted, [key]);
}
