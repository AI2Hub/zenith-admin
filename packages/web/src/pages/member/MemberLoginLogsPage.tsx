import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Input, Select, Tag } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import type { MemberLoginLog, PaginatedResponse } from '@zenith/shared';
import { request } from '@/utils/request';
import { usePagination } from '@/hooks/usePagination';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { renderEllipsis } from '../../utils/table-columns';
import { formatDateForApi } from '@/utils/date';

interface SearchParams {
  keyword?: string;
  status?: 'success' | 'fail';
  dateRange: [Date, Date] | null;
}

const defaultSearch: SearchParams = { keyword: undefined, status: undefined, dateRange: null };

const statusOptions = [
  { value: 'success', label: '成功' },
  { value: 'fail', label: '失败' },
];

export default function MemberLoginLogsPage() {
  const [data, setData] = useState<MemberLoginLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = search;
  const { page, pageSize, setPage, buildPagination } = usePagination();

  const fetchData = useCallback(async (p = page, ps = pageSize, params?: SearchParams) => {
    const current = params ?? searchRef.current;
    setLoading(true);
    try {
      const [dateStart, dateEnd] = current.dateRange ?? [];
      const q = new URLSearchParams({
        page: String(p),
        pageSize: String(ps),
        ...(current.keyword ? { keyword: current.keyword } : {}),
        ...(current.status ? { status: current.status } : {}),
        ...(dateStart ? { dateStart: formatDateForApi(dateStart) } : {}),
        ...(dateEnd ? { dateEnd: formatDateForApi(dateEnd) } : {}),
      }).toString();
      const res = await request.get<PaginatedResponse<MemberLoginLog>>(`/api/members/login-logs?${q}`);
      if (res.code === 0) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSearch = () => { setPage(1); void fetchData(1, pageSize); };
  const handleReset = () => { setSearch(defaultSearch); setPage(1); void fetchData(1, pageSize, defaultSearch); };

  const columns: ColumnProps<MemberLoginLog>[] = [
    { title: '会员', dataIndex: 'memberNickname', width: 140, render: (v?: string | null, r?: MemberLoginLog) => v || (r?.memberId ? `#${r.memberId}` : '—') },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v ?? '—' },
    { title: '地点', dataIndex: 'location', width: 140, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '浏览器', dataIndex: 'browser', width: 130, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '操作系统', dataIndex: 'os', width: 130, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '说明', dataIndex: 'message', render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '状态', dataIndex: 'status', width: 90, fixed: 'right', render: (v: 'success' | 'fail') => <Tag color={v === 'success' ? 'green' : 'red'}>{v === 'success' ? '成功' : '失败'}</Tag> },
    { title: '登录时间', dataIndex: 'createdAt', width: 180, fixed: 'right' },
  ];

  const renderKeywordSearch = () => (
    <Input
      placeholder="会员昵称/手机号/用户名"
      prefix={<Search size={14} />}
      value={search.keyword}
      showClear
      style={{ width: 220 }}
      onChange={(value) => setSearch((prev) => ({ ...prev, keyword: value || undefined }))}
      onEnterPress={handleSearch}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="全部状态"
      value={search.status}
      style={{ width: 130 }}
      showClear
      optionList={statusOptions}
      onChange={(value) => setSearch((prev) => ({ ...prev, status: value as 'success' | 'fail' | undefined }))}
    />
  );

  const renderDateRangeFilter = () => (
    <DatePicker
      type="dateRange"
      placeholder={['开始日期', '结束日期']}
      value={search.dateRange ?? undefined}
      onChange={(value) => setSearch((prev) => ({ ...prev, dateRange: value ? (value as [Date, Date]) : null }))}
      style={{ width: 300 }}
    />
  );

  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderStatusFilter()}
            {renderDateRangeFilter()}
            {renderSearchButton()}
            {renderResetButton()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordSearch()}
            {renderSearchButton()}
          </>
        )}
        mobileFilters={(
          <>
            {renderStatusFilter()}
            {renderDateRangeFilter()}
          </>
        )}
        filterTitle="登录日志筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data}
        loading={loading}
        onRefresh={fetchData}
        refreshLoading={loading}
        rowKey="id"
        size="small"
        pagination={buildPagination(total, fetchData)}
        empty="暂无登录日志"
        scroll={{ x: 1200 }}
      />
    </div>
  );
}
