import { useMemo } from 'react';
import { compactParams, type CompactParams } from '@/lib/query';

/**
 * 已提交筛选 → 契约查询参数：丢弃 `undefined` / `null` / 空串，保留 `0` / `false`。
 * 按内容保持引用稳定，供列表、导出与 query key 共用；无需依赖数组，外部值变化也会参与比较。
 * 参数只含 JSON 标量 / 数组，序列化比较成本低。
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
