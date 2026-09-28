import { useDeferredValue, useState } from 'react';
import { Pagination, Typography } from '@douyinfe/semi-ui';
import { FilterSelect } from '@/components/search-filters';
import { COMPACT_PAGINATION_PROPS, usePagination } from '@/hooks/usePagination';
import { useCmsStatsReport, type CmsStatsQuery } from '@/hooks/queries/cms-stats';

/** 使用报表的服务端名称检索与分页，首屏快捷选项不限制可选择范围。 */
export default function CmsStatsNameFilter<V extends string | number>({ query, dimension, value, onChange, initialOptions, placeholder, width = 180 }: Readonly<{
  query: CmsStatsQuery; dimension: 'content' | 'channel' | 'author' | 'release'; value?: V; onChange: (value: V | undefined) => void;
  initialOptions: { value: V; label: string }[]; placeholder: string; width?: number;
}>) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<{ value: V; label: string }>();
  const deferred = useDeferredValue(keyword);
  const paging = usePagination({ pageSize: 30, resetKey: [query.siteId, query.startTime, query.endTime, deferred, dimension] });
  const lookupQuery = { ...query, contentId: undefined, channelId: undefined, releaseId: undefined, author: undefined };
  const report = useCmsStatsReport({ ...lookupQuery, dimension, keyword: deferred, page: paging.page, pageSize: paging.pageSize }, open);
  const exactFilter = dimension === 'author' ? { author: value === undefined ? undefined : String(value) } : { [{ content: 'contentId', channel: 'channelId', release: 'releaseId' }[dimension]]: value === undefined ? undefined : Number(value) };
  const needsLabel = value !== undefined && !initialOptions.some((item) => item.value === value) && selected?.value !== value;
  const exact = useCmsStatsReport({ ...lookupQuery, ...exactFilter, dimension, page: 1, pageSize: 1 }, needsLabel);
  const choices = new Map((report.data ? report.data.list.map((row) => ({ value: (dimension === 'author' ? row.key : Number(row.key)) as V, label: row.label })) : initialOptions).filter((item) => typeof item.value === 'string' || Number.isSafeInteger(item.value)).map((item) => [item.value, item]));
  if (value !== undefined && !choices.has(value)) {
    const label = selected?.value === value ? selected.label : initialOptions.find((item) => item.value === value)?.label ?? exact.data?.list.find((row) => row.key === String(value))?.label ?? String(value);
    choices.set(value, { value, label });
  }
  return <FilterSelect value={value} onChange={(next) => { setSelected(next === undefined ? undefined : choices.get(next)); onChange(next); }} placeholder={placeholder}
    items={[...choices.values()]} width={width} filter remote loading={report.isFetching || exact.isFetching} onSearch={setKeyword} onDropdownVisibleChange={setOpen}
    outerBottomSlot={<div style={{ padding: 8 }}>
      {report.isError ? <Typography.Text type="danger">名称查询失败，请重新打开后重试</Typography.Text> : <Typography.Text type="tertiary">共 {report.data?.total ?? initialOptions.length} 项，可输入名称搜索</Typography.Text>}
      <Pagination {...COMPACT_PAGINATION_PROPS} currentPage={paging.page} pageSize={paging.pageSize} total={report.data?.total ?? 0} onPageChange={paging.setPage} />
    </div>} />;
}
