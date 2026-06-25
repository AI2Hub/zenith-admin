import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Button, DatePicker, Input, Modal, Select, Tag, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { request } from '@/utils/request';
import { formatDateTime, formatDateTimeForApi } from '@/utils/date';
import { usePagination } from '@/hooks/usePagination';
import { PAYMENT_CHANNEL_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentNotifyLog, PaginatedResponse } from '@zenith/shared';

interface SearchParams { keyword: string; channel: string; scene: string; signatureValid: string; timeRange: [Date, Date] | null; }
const defaultSearch: SearchParams = { keyword: '', channel: '', scene: '', signatureValid: '', timeRange: null };

function formatRaw(raw: string | null | undefined): string {
  if (!raw) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

const codeBlockStyle: CSSProperties = {
  maxHeight: 260, overflow: 'auto', fontSize: 12, background: 'var(--semi-color-fill-0)',
  padding: 12, borderRadius: 4, wordBreak: 'break-all', whiteSpace: 'pre-wrap', margin: 0,
};

export default function PaymentLogsPage() {
  const [data, setData] = useState<PaginatedResponse<PaymentNotifyLog> | null>(null);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = searchParams;
  const [detailLog, setDetailLog] = useState<PaymentNotifyLog | null>(null);

  const fetchList = useCallback(
    async (p = page, ps = pageSize, params?: SearchParams) => {
      const active = params ?? searchRef.current;
      setLoading(true);
      try {
        const query: Record<string, string> = { page: String(p), pageSize: String(ps) };
        if (active.keyword) query.keyword = active.keyword;
        if (active.channel) query.channel = active.channel;
        if (active.scene) query.scene = active.scene;
        if (active.signatureValid) query.signatureValid = active.signatureValid;
        if (active.timeRange) {
          query.startTime = formatDateTimeForApi(active.timeRange[0]);
          query.endTime = formatDateTimeForApi(active.timeRange[1]);
        }
        const res = await request.get<PaginatedResponse<PaymentNotifyLog>>(`/api/payment/logs?${new URLSearchParams(query)}`);
        if (res.code === 0) { setData(res.data); setPage(res.data.page); setPageSize(res.data.pageSize); }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize],
  );

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() { setPage(1); void fetchList(1, pageSize); }
  function handleReset() { setSearchParams(defaultSearch); setPage(1); void fetchList(1, pageSize, defaultSearch); }

  const columns: ColumnProps<PaymentNotifyLog>[] = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: PaymentChannel) => <Tag color={v === 'wechat' ? 'green' : 'blue'}>{PAYMENT_CHANNEL_LABELS[v]}</Tag> },
    { title: '场景', dataIndex: 'scene', width: 100, render: (v: string) => (v === 'refund' ? '退款回调' : '支付回调') },
    { title: '订单号', dataIndex: 'orderNo', width: 200, render: (v: string | null) => v || '-' },
    { title: '验签', dataIndex: 'signatureValid', width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '通过' : '失败'}</Tag> },
    { title: '结果', dataIndex: 'result', width: 120, render: (v: string | null) => v || '-' },
    { title: '说明', dataIndex: 'message', width: 220, render: (v: string | null) => <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 200 }}>{v || '-'}</Typography.Text> },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v || '-' },
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (t: string) => formatDateTime(t) },
    {
      title: '操作', fixed: 'right', width: 80,
      render: (_: unknown, r: PaymentNotifyLog) => (
        <Button theme="borderless" size="small" disabled={!r.rawBody && !r.headers} onClick={() => setDetailLog(r)}>详情</Button>
      ),
    },
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="订单号..."
      value={searchParams.keyword}
      onChange={(v) => setSearchParams((p) => ({ ...p, keyword: v }))}
      showClear
      style={{ width: 200 }}
      onEnterPress={handleSearch}
    />
  );

  const renderChannelFilter = () => (
    <Select
      placeholder="全部渠道"
      value={searchParams.channel || undefined}
      onChange={(v) => setSearchParams((p) => ({ ...p, channel: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={[{ value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' }]}
    />
  );

  const renderSceneFilter = () => (
    <Select
      placeholder="全部场景"
      value={searchParams.scene || undefined}
      onChange={(v) => setSearchParams((p) => ({ ...p, scene: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={[{ value: 'payment', label: '支付回调' }, { value: 'refund', label: '退款回调' }]}
    />
  );

  const renderSignatureFilter = () => (
    <Select
      placeholder="验签结果"
      value={searchParams.signatureValid || undefined}
      onChange={(v) => setSearchParams((p) => ({ ...p, signatureValid: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={[{ value: 'true', label: '验签通过' }, { value: 'false', label: '验签失败' }]}
    />
  );

  const renderTimeRangeFilter = () => (
    <DatePicker
      type="dateTimeRange"
      placeholder={['开始时间', '结束时间']}
      value={searchParams.timeRange ?? undefined}
      onChange={(v) => setSearchParams((p) => ({ ...p, timeRange: v ? (v as [Date, Date]) : null }))}
      style={{ width: 330 }}
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
            {renderSceneFilter()}
            {renderSignatureFilter()}
            {renderTimeRangeFilter()}
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
            {renderSceneFilter()}
            {renderSignatureFilter()}
            {renderTimeRangeFilter()}
          </>
        )}
        filterTitle="支付回调日志筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered columns={columns} dataSource={data?.list ?? []} loading={loading} rowKey="id" size="small" empty="暂无数据"
        onRefresh={() => void fetchList()} refreshLoading={loading} pagination={buildPagination(data?.total ?? 0, fetchList)}
      />

      <Modal
        title={`回调详情（#${detailLog?.id ?? ''}）`}
        visible={!!detailLog}
        onCancel={() => setDetailLog(null)}
        footer={null}
        width={720}
        closeOnEsc
      >
        {detailLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tag color={detailLog.channel === 'wechat' ? 'green' : 'blue'}>{PAYMENT_CHANNEL_LABELS[detailLog.channel]}</Tag>
              <Tag color="grey">{detailLog.scene === 'refund' ? '退款回调' : '支付回调'}</Tag>
              <Tag color={detailLog.signatureValid ? 'green' : 'red'}>{detailLog.signatureValid ? '验签通过' : '验签失败'}</Tag>
              {detailLog.orderNo && <Typography.Text type="tertiary">订单号：{detailLog.orderNo}</Typography.Text>}
            </div>
            {detailLog.message && <Typography.Text type="warning">{detailLog.message}</Typography.Text>}
            {detailLog.headers && (
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>请求头</Typography.Text>
                <pre style={codeBlockStyle}>{formatRaw(detailLog.headers)}</pre>
              </div>
            )}
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>原始 Body</Typography.Text>
              <pre style={codeBlockStyle}>{formatRaw(detailLog.rawBody) || '（无）'}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
