import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Dropdown, Input, Select, SplitButtonGroup, Tag, Descriptions } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw, Download, ChevronDown } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import { request } from '@/utils/request';
import { formatDateTime } from '@/utils/date';
import { usePagination } from '@/hooks/usePagination';
import { PAYMENT_CHANNEL_LABELS, PAYMENT_REFUND_STATUS_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentRefund, PaymentRefundStatus, PaginatedResponse } from '@zenith/shared';

const STATUS_COLOR = { pending: 'grey', processing: 'blue', success: 'green', failed: 'red' } as const satisfies Record<PaymentRefundStatus, string>;
const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

interface SearchParams { keyword: string; channel: string; status: string; }
const defaultSearch: SearchParams = { keyword: '', channel: '', status: '' };

export default function PaymentRefundsPage() {
  const [data, setData] = useState<PaginatedResponse<PaymentRefund> | null>(null);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = searchParams;
  const [detail, setDetail] = useState<PaymentRefund | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportCsvLoading, setExportCsvLoading] = useState(false);

  const fetchList = useCallback(
    async (p = page, ps = pageSize, params?: SearchParams) => {
      const active = params ?? searchRef.current;
      setLoading(true);
      try {
        const query: Record<string, string> = { page: String(p), pageSize: String(ps) };
        if (active.keyword) query.keyword = active.keyword;
        if (active.channel) query.channel = active.channel;
        if (active.status) query.status = active.status;
        const res = await request.get<PaginatedResponse<PaymentRefund>>(`/api/payment/refunds?${new URLSearchParams(query)}`);
        if (res.code === 0) { setData(res.data); setPage(res.data.page); setPageSize(res.data.pageSize); }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize],
  );

  useEffect(() => { void fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function handleSearch() { setPage(1); void fetchList(1, pageSize); }
  function handleReset() { setSearchParams(defaultSearch); setPage(1); void fetchList(1, pageSize, defaultSearch); }

  function buildExportQuery(): string {
    const a = searchRef.current;
    const q: Record<string, string> = {};
    if (a.keyword) q.keyword = a.keyword;
    if (a.channel) q.channel = a.channel;
    if (a.status) q.status = a.status;
    return new URLSearchParams(q).toString();
  }
  async function handleExport() {
    setExportLoading(true);
    try { await request.download(`/api/payment/refunds/export?${buildExportQuery()}`, '退款记录.xlsx'); } finally { setExportLoading(false); }
  }
  async function handleExportCsv() {
    setExportCsvLoading(true);
    try { await request.download(`/api/payment/refunds/export/csv?${buildExportQuery()}`, '退款记录.csv'); } finally { setExportCsvLoading(false); }
  }

  const columns: ColumnProps<PaymentRefund>[] = [
    { title: '退款单号', dataIndex: 'refundNo', width: 200 },
    { title: '原订单号', dataIndex: 'orderNo', width: 200 },
    { title: '退款金额', dataIndex: 'refundAmount', width: 110, render: (v: number) => yuan(v) },
    { title: '原单金额', dataIndex: 'totalAmount', width: 110, render: (v: number) => yuan(v) },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: PaymentChannel) => <Tag color={v === 'wechat' ? 'green' : 'blue'}>{PAYMENT_CHANNEL_LABELS[v]}</Tag> },
    { title: '退款时间', dataIndex: 'refundedAt', width: 170, render: (t: string | null) => (t ? formatDateTime(t) : '-') },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (t: string) => formatDateTime(t) },
    { title: '状态', dataIndex: 'status', width: 90, fixed: 'right', render: (v: PaymentRefundStatus) => <Tag color={STATUS_COLOR[v]}>{PAYMENT_REFUND_STATUS_LABELS[v]}</Tag> },
    { title: '操作', fixed: 'right', width: 80, render: (_: unknown, r: PaymentRefund) => <Button theme="borderless" size="small" onClick={() => setDetail(r)}>详情</Button> },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input prefix={<Search size={14} />} placeholder="退款单号/订单号..." value={searchParams.keyword} onChange={(v) => setSearchParams((p) => ({ ...p, keyword: v }))} showClear style={{ width: 220 }} onEnterPress={handleSearch} />
        <Select placeholder="全部渠道" value={searchParams.channel || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, channel: (v as string) ?? '' }))} showClear style={{ width: 120 }}
          optionList={[{ value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' }]} />
        <Select placeholder="全部状态" value={searchParams.status || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, status: (v as string) ?? '' }))} showClear style={{ width: 120 }}
          optionList={Object.entries(PAYMENT_REFUND_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
        <SplitButtonGroup>
          <Button type="primary" icon={<Download size={14} />} loading={exportLoading} onClick={handleExport}>导出</Button>
          <Dropdown trigger="click" position="bottomRight" clickToHide render={(
            <Dropdown.Menu>
              <Dropdown.Item onClick={handleExport}>导出 Excel</Dropdown.Item>
              <Dropdown.Item onClick={handleExportCsv}>导出 CSV</Dropdown.Item>
            </Dropdown.Menu>
          )}>
            <Button type="primary" icon={<ChevronDown size={14} />} loading={exportCsvLoading} />
          </Dropdown>
        </SplitButtonGroup>
      </SearchToolbar>

      <ConfigurableTable
        bordered columns={columns} dataSource={data?.list ?? []} loading={loading} rowKey="id" size="small" empty="暂无数据"
        onRefresh={() => void fetchList()} refreshLoading={loading} pagination={buildPagination(data?.total ?? 0, fetchList)}
      />

      <AppModal title="退款详情" visible={!!detail} onCancel={() => setDetail(null)} footer={null} width={560} closeOnEsc>
        {detail && (
          <Descriptions
            row
            data={[
              { key: '退款单号', value: detail.refundNo },
              { key: '渠道退款号', value: detail.channelRefundNo ?? '-' },
              { key: '原订单号', value: detail.orderNo },
              { key: '退款金额', value: yuan(detail.refundAmount) },
              { key: '原单金额', value: yuan(detail.totalAmount) },
              { key: '渠道', value: PAYMENT_CHANNEL_LABELS[detail.channel] },
              { key: '状态', value: PAYMENT_REFUND_STATUS_LABELS[detail.status] },
              { key: '退款原因', value: detail.reason ?? '-' },
              { key: '退款时间', value: detail.refundedAt ? formatDateTime(detail.refundedAt) : '-' },
              { key: '创建时间', value: formatDateTime(detail.createdAt) },
              { key: '错误信息', value: detail.errorMessage ?? '-' },
            ]}
          />
        )}
      </AppModal>
    </div>
  );
}
