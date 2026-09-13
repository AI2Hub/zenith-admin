import type { Data } from '@douyinfe/semi-ui/lib/es/table';
import { listTableProps, type ListQueryLike, type ListTablePropsOptions } from '@/components/list-page';
import { useFilterQuery } from '@/hooks/useFilterQuery';
import { useListSearch, type UseListSearchOptions, type UseListSearchReturn } from '@/hooks/useListSearch';
import type { CompactParams } from '@/lib/query';

interface PageParams {
  readonly page: number;
  readonly pageSize: number;
}

/** 分页包络或裸数组里的行类型；`never`（pending / error 成员的 `data: undefined`）不参与推导 */
type ItemOfData<TData> = [TData] extends [never] ? never : TData extends { list: (infer TItem)[] } ? TItem : TData extends (infer TItem)[] ? TItem : never;
/** 列表查询结果里的行类型：只看 `data` 的成功形态 */
type ItemOf<TList> = TList extends { data?: infer TData } ? ItemOfData<NonNullable<TData>> : never;

export interface UseListPageOptions<TSearch, TRaw extends Record<string, unknown>, TList extends ListQueryLike<Data>>
  extends UseListSearchOptions<TSearch> {
  /**
   * 域 hooks 的列表查询（`createResourceQueries(...).useList` 或同签名的手写 hook）。
   * 与 `useEditModal({ useDetail })` 一样必须是模块级稳定函数；参数类型即契约 `QueryOf`，
   * `toQuery` 的结果会在这里被契约类型检查（`NoInfer` 保证映射类型只从 `toQuery` 推导）。
   */
  readonly useList: (params: PageParams & NoInfer<CompactParams<TRaw>>, enabled?: boolean) => TList;
  /** 已提交筛选 → 契约查询参数（不含 page / pageSize）；结果经 `useFilterQuery` 收口后再交给 `useList` */
  readonly toQuery: (submitted: TSearch) => TRaw;
  /** 列表查询的启用开关（等待作用域就绪时传 false） */
  readonly enabled?: boolean;
  /** 表格接线选项：`rowSelection` / `empty` / `rowKey` / `size` / `bordered`；分页由本 hook 接好 */
  readonly table?: Omit<ListTablePropsOptions<ItemOf<TList>>, 'pagination'>;
}

export interface UseListPageReturn<TSearch, TRaw extends Record<string, unknown>, TList extends ListQueryLike<Data>>
  extends UseListSearchReturn<TSearch> {
  /** 已提交筛选映射出的契约查询参数（不含分页）：给 `ExportButton query` / 深链 / 其它同源查询 */
  readonly filterQuery: CompactParams<TRaw>;
  /** 列表查询结果（`data` / `isFetching` / `refetch` …） */
  readonly listQuery: TList;
  /** 直接展开到 `ConfigurableTable`：数据源、loading、刷新、分页、多选 */
  readonly tableProps: ReturnType<typeof listTableProps<ItemOf<TList>>>;
}

/**
 * 标准分页列表页的一站式接线：搜索状态（`useListSearch`）→ 筛选映射（`useFilterQuery`）→ 列表查询 → 表格 props。
 *
 * 结构上杜绝三类接线错误：漏掉 `...filterQuery`、把草稿 `draftParams` 当作查询条件、漏传 `pagination: buildPagination`。
 * 树形 / 不分页 / 客户端过滤 / 一页多列表 / 会员端 `requestOptions` 等非标准形态退一层直接用
 * `useListSearch` + `useFilterQuery`。
 *
 * @example
 * const { bind, bindKeyword, handleSearch, handleReset, filterQuery, tableProps } = useListPage({
 *   defaults: defaultSearchParams,
 *   listKey: xxxKeys.lists,
 *   useList: useXxxList,
 *   toQuery: (s) => ({ keyword: s.keyword, status: enumValueOf(XXX_STATUSES, s.status) }),
 *   table: { rowSelection },
 * });
 * <ConfigurableTable<Xxx> columns={columns} {...tableProps} />
 * <ExportButton entity="system.xxxs" query={filterQuery} permission="system:xxx:export" />
 */
export function useListPage<TSearch, TRaw extends Record<string, unknown>, TList extends ListQueryLike<Data>>(
  { useList, toQuery, enabled, table, ...searchOptions }: UseListPageOptions<TSearch, TRaw, TList>,
): UseListPageReturn<TSearch, TRaw, TList> {
  const search = useListSearch<TSearch>(searchOptions);
  const filterQuery = useFilterQuery(toQuery(search.submittedParams));
  const listQuery = useList({ page: search.page, pageSize: search.pageSize, ...filterQuery }, enabled);
  const tableProps = listTableProps<ItemOf<TList>>(listQuery as unknown as ListQueryLike<ItemOf<TList>>, { pagination: search.buildPagination, ...table });
  return { ...search, filterQuery, listQuery, tableProps };
}
