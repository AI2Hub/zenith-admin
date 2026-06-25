import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Input, Select, Tag } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import type { MemberRecharge, PaymentChannel, PaymentOrderStatus, PaginatedResponse } from '@zenith/shared';
import { PAYMENT_CHANNEL_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_ORDER_STATUS_LABELS } from '@zenith/shared';
import { request } from '@/utils/request';
import { usePagination } from '@/hooks/usePagination';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { renderEllipsis } from '../../utils/table-columns';
import { formatDateForApi } from '@/utils/date';

interface SearchParams {
  keyword?: string;
  status?: PaymentOrderStatus;
  channel?: PaymentChannel;
  dateRange: [Date, Date] | null;
}

const defaultSearch: SearchParams = { keyword: undefined, status: undefined, channel: undefined, dateRange: null };

const statusOptions = (Object.keys(PAYMENT_ORDER_STATUS_LABELS) as PaymentOrderStatus[]).map((v) => ({ value: v, label: PAYMENT_ORDER_STATUS_LABELS[v] }));
const channelOptions = (Object.keys(PAYMENT_CHANNEL_LABELS) as PaymentChannel[]).map((v) => ({ value: v, label: PAYMENT_CHANNEL_LABELS[v] }));

const STATUS_COLORS: Record<PaymentOrderStatus, string> = {
  pending: 'grey', paying: 'blue', success: 'green', closed: 'grey', refunding: 'orange', refunded: 'orange', failed: 'red',
};

export default function MemberRechargesPage() {
  const [data, setData] = useState<MemberRecharge[]>([]);
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
        ...(current.channel ? { channel: current.channel } : {}),
        ...(dateStart ? { dateStart: formatDateForApi(dateStart) } : {}),
        ...(dateEnd ? { dateEnd: formatDateForApi(dateEnd) } : {}),
      }).toString();
      const res = await request.get<PaginatedResponse<MemberRecharge>>(`/api/member-recharges?${q}`);
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

  const columns: ColumnProps<MemberRecharge>[] = [
    { title: '订单号', dataIndex: 'orderNo', width: 200, fixed: 'left', render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '会员', dataIndex: 'memberNickname', width: 140, render: (v: string | null, r: MemberRecharge) => v || (r.memberId ? `#${r.memberId}` : '—') },
    { title: '手机号', dataIndex: 'memberPhone', width: 130, render: (v: string | null) => v ?? '—' },
    { title: '金额(元)', dataIndex: 'amount', width: 110, render: (v: number) => <span style={{ fontWeight: 600 }}>{(v / 100).toFixed(2)}</span> },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: PaymentChannel) => PAYMENT_CHANNEL_LABELS[v] ?? v },
    { title: '支付方式', dataIndex: 'payMethod', width: 130, render: (v: string) => PAYMENT_METHOD_LABELS[v as keyof typeof PAYMENT_METHOD_LABELS] ?? v },
    { title: '说明', dataIndex: 'subject', width: 160, render: (v: string) => renderEllipsis(v) },
    { title: '状态', dataIndex: 'status', width: 100, fixed: 'right', render: (v: PaymentOrderStatus) => <Tag color={STATUS_COLORS[v] as 'green'}>{PAYMENT_ORDER_STATUS_LABELS[v] ?? v}</Tag> },
    { title: '支付时间', dataIndex: 'paidAt', width: 180, fixed: 'right', render: (v: string | null) => v ?? '—' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, fixed: 'right' },
  ];

  const renderKeywordSearch = () => (
    <Input
      placeholder="会员昵称/手机号/订单号"
      prefix={<Search size={14} />}
      value={search.keyword}
      showClear
      style={{ width: 220 }}
      onChange={(value) => setSearch((prev) => ({ ...prev, keyword: value || undefined }))}
      onEnterPress={handleSearch}
    />
  );

  const renderChannelFilter = () => (
    <Select
      placeholder="全部渠道"
      value={search.channel}
      style={{ width: 120 }}
      showClear
      optionList={channelOptions}
      onChange={(value) => setSearch((prev) => ({ ...prev, channel: value as PaymentChannel | undefined }))}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="全部状态"
      value={search.status}
      style={{ width: 130 }}
      showClear
      optionList={statusOptions}
      onChange={(value) => setSearch((prev) => ({ ...prev, status: value as PaymentOrderStatus | undefined }))}
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
            {renderChannelFilter()}
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
            {renderChannelFilter()}
            {renderStatusFilter()}
            {renderDateRangeFilter()}
          </>
        )}
        filterTitle="充值记录筛选"
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
        empty="暂无充值记录"
        scroll={{ x: 1500 }}
      />
    </div>
  );
}
