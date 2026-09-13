export interface KeywordFilterOptions {
  caseInsensitive?: boolean;
}

type KeywordValue = string | number | boolean | null | undefined;

function isOptions(value: KeywordValue | KeywordFilterOptions): value is KeywordFilterOptions {
  return typeof value === 'object' && value !== null && 'caseInsensitive' in value;
}

export function includesKeyword(
  keyword: string | null | undefined,
  ...valuesAndOptions: Array<KeywordValue | KeywordFilterOptions>
): boolean {
  const options = valuesAndOptions.length > 0 && isOptions(valuesAndOptions[valuesAndOptions.length - 1])
    ? valuesAndOptions.pop() as KeywordFilterOptions
    : undefined;
  const normalizedKeyword = options?.caseInsensitive ? (keyword ?? '').toLowerCase() : (keyword ?? '');
  if (!normalizedKeyword) return true;
  return valuesAndOptions.some((value) => {
    const text = String(value ?? '');
    return (options?.caseInsensitive ? text.toLowerCase() : text).includes(normalizedKeyword);
  });
}

export function filterByKeyword<T>(
  list: readonly T[],
  keyword: string | null | undefined,
  selectors: Array<(item: T) => KeywordValue>,
  options?: KeywordFilterOptions,
): T[] {
  if (!keyword) return [...list];
  return list.filter((item) => includesKeyword(keyword, ...selectors.map((select) => select(item)), options));
}

/**
 * 枚举 / ID / 布尔类精确筛选：`expected` 未传（`undefined` / `null` / 空串）即不过滤，否则严格相等。
 * 与契约 `queryEnum` / `queryBool` 及前端 `compactParams` 的「空串 = 未筛选」一致——
 * `false` / `0` 是有效筛选值，不要再写 `!query.x || item.x === query.x`（会把 false / 0 当成未筛选）。
 *
 * @example
 * list.filter((item) => matchesFilter(item.status, query.status) && matchesFilter(item.channel, query.channel))
 */
export function matchesFilter<T>(actual: T, expected: T | null | undefined | ''): boolean {
  return expected === undefined || expected === null || expected === '' || actual === expected;
}

/**
 * 时间范围筛选（闭区间）：`start` / `end` 未传即不限制；`end` 为纯日期（`YYYY-MM-DD`）时补到当天 `23:59:59`，
 * 与服务端 `dateRangeConditions` 的语义一致——「到 8 月 1 日」包含整个 8 月 1 日。
 * 值与端点都按 `YYYY-MM-DD HH:mm:ss` 字符串比较，与契约 `dateRangeBound` 的两种输入格式兼容。
 *
 * @example
 * list.filter((o) => matchesFilter(o.status, query.status) && withinDateRange(o.createdAt, query.startTime, query.endTime))
 */
export function withinDateRange(value: string | null | undefined, start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start && !end) return true;
  const v = value ?? '';
  if (start && v < start) return false;
  if (end && v > (end.length === 10 ? `${end} 23:59:59` : end)) return false;
  return true;
}
