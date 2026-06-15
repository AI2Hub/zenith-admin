import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Form, Input, Select, Space, Toast, Tag, Modal, Descriptions, InputNumber } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import { Search, RotateCcw } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import { request } from '@/utils/request';
import { formatDateTime } from '@/utils/date';
import { usePermission } from '@/hooks/usePermission';
import { usePagination } from '@/hooks/usePagination';
import { PAYMENT_CHANNEL_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_ORDER_STATUS_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentMethod, PaymentOrder, PaymentOrderStatus, PaginatedResponse } from '@zenith/shared';

const STATUS_COLOR = {
  pending: 'grey', paying: 'blue', success: 'green', closed: 'grey', refunding: 'amber', refunded: 'orange', failed: 'red',
} as const satisfies Record<PaymentOrderStatus, string>;
const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

interface SearchParams { keyword: string; channel: string; status: string; bizType: string; }
const defaultSearch: SearchParams = { keyword: '', channel: '', status: '', bizType: '' };

export default function PaymentOrdersPage() {
  const { hasPermission } = usePermission();
  const refundFormApi = useRef<FormApi | null>(null);

  const [data, setData] = useState<PaginatedResponse<PaymentOrder> | null>(null);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = searchParams;

  const [detail, setDetail] = useState<PaymentOrder | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null);
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  const fetchList = useCallback(
    async (p = page, ps = pageSize, params?: SearchParams) => {
      const active = params ?? searchRef.current;
      setLoading(true);
      try {
        const query: Record<string, string> = { page: String(p), pageSize: String(ps) };
        if (active.keyword) query.keyword = active.keyword;
        if (active.channel) query.channel = active.channel;
        if (active.status) query.status = active.status;
        if (active.bizType) query.bizType = active.bizType;
        const res = await request.get<PaginatedResponse<PaymentOrder>>(`/api/payment/orders?${new URLSearchParams(query)}`);
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

  async function handleQuery(record: PaymentOrder) {
    const res = await request.post<PaymentOrder>(`/api/payment/orders/${record.id}/query`);
    if (res.code === 0) { Toast.success(`最新状态：${PAYMENT_ORDER_STATUS_LABELS[res.data.status]}`); void fetchList(); }
  }
  function handleClose(record: PaymentOrder) {
    Modal.confirm({
      title: '确认关闭订单', content: `确认关闭订单 ${record.orderNo}？`,
      onOk: async () => {
        const res = await request.post(`/api/payment/orders/${record.id}/close`);
        if (res.code === 0) { Toast.success('订单已关闭'); void fetchList(); }
      },
    });
  }

  async function submitRefund() {
    if (!refundTarget) return;
    const api = refundFormApi.current;
    if (!api) return;
    let values: { amountYuan: number; reason?: string };
    try { values = await api.validate(); } catch { throw new Error('validation'); }
    setRefundSubmitting(true);
    try {
      const res = await request.post('/api/payment/refunds', {
        orderNo: refundTarget.orderNo,
        refundAmount: Math.round(values.amountYuan * 100),
        reason: values.reason,
      });
      if (res.code === 0) { Toast.success('退款已发起'); setRefundTarget(null); void fetchList(); }
      else throw new Error(res.message);
    } finally {
      setRefundSubmitting(false);
    }
  }

  const columns: ColumnProps<PaymentOrder>[] = [
    { title: '订单号', dataIndex: 'orderNo', width: 200 },
    { title: '标题', dataIndex: 'subject', width: 180, render: (v: string) => v || '-' },
    { title: '金额', dataIndex: 'amount', width: 110, render: (v: number) => yuan(v) },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: PaymentChannel) => <Tag color={v === 'wechat' ? 'green' : 'blue'}>{PAYMENT_CHANNEL_LABELS[v]}</Tag> },
    { title: '方式', dataIndex: 'payMethod', width: 130, render: (v: PaymentMethod) => PAYMENT_METHOD_LABELS[v] },
    { title: '业务类型', dataIndex: 'bizType', width: 120, render: (v: string) => v || '-' },
    { title: '支付时间', dataIndex: 'paidAt', width: 170, render: (t: string | null) => (t ? formatDateTime(t) : '-') },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (t: string) => formatDateTime(t) },
    {
      title: '状态', dataIndex: 'status', width: 90, fixed: 'right',
      render: (v: PaymentOrderStatus) => <Tag color={STATUS_COLOR[v]}>{PAYMENT_ORDER_STATUS_LABELS[v]}</Tag>,
    },
    {
      title: '操作', fixed: 'right', width: 200,
      render: (_: unknown, r: PaymentOrder) => (
        <Space>
          <Button theme="borderless" size="small" onClick={() => setDetail(r)}>详情</Button>
          {hasPermission('payment:order:list') && (r.status === 'paying' || r.status === 'pending') && (
            <Button theme="borderless" size="small" onClick={() => handleQuery(r)}>查单</Button>
          )}
          {hasPermission('payment:order:close') && (r.status === 'paying' || r.status === 'pending') && (
            <Button theme="borderless" size="small" onClick={() => handleClose(r)}>关闭</Button>
          )}
          {hasPermission('payment:order:refund') && (r.status === 'success' || r.status === 'refunding') && (
            <Button theme="borderless" type="danger" size="small" onClick={() => setRefundTarget(r)}>退款</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input prefix={<Search size={14} />} placeholder="订单号/标题..." value={searchParams.keyword} onChange={(v) => setSearchParams((p) => ({ ...p, keyword: v }))} showClear style={{ width: 200 }} onEnterPress={handleSearch} />
        <Input placeholder="业务类型" value={searchParams.bizType} onChange={(v) => setSearchParams((p) => ({ ...p, bizType: v }))} showClear style={{ width: 140 }} onEnterPress={handleSearch} />
        <Select placeholder="全部渠道" value={searchParams.channel || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, channel: (v as string) ?? '' }))} showClear style={{ width: 120 }}
          optionList={[{ value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' }]} />
        <Select placeholder="全部状态" value={searchParams.status || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, status: (v as string) ?? '' }))} showClear style={{ width: 120 }}
          optionList={Object.entries(PAYMENT_ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
      </SearchToolbar>

      <ConfigurableTable
        bordered columns={columns} dataSource={data?.list ?? []} loading={loading} rowKey="id" size="small" empty="暂无数据"
        onRefresh={() => void fetchList()} refreshLoading={loading} pagination={buildPagination(data?.total ?? 0, fetchList)}
      />

      <AppModal title="订单详情" visible={!!detail} onCancel={() => setDetail(null)} footer={null} width={620} closeOnEsc>
        {detail && (
          <Descriptions
            row
            data={[
              { key: '订单号', value: detail.orderNo },
              { key: '商户单号', value: detail.outTradeNo },
              { key: '渠道交易号', value: detail.channelTradeNo ?? '-' },
              { key: '标题', value: detail.subject },
              { key: '金额', value: yuan(detail.amount) },
              { key: '实付', value: detail.paidAmount == null ? '-' : yuan(detail.paidAmount) },
              { key: '渠道', value: PAYMENT_CHANNEL_LABELS[detail.channel] },
              { key: '方式', value: PAYMENT_METHOD_LABELS[detail.payMethod] },
              { key: '状态', value: PAYMENT_ORDER_STATUS_LABELS[detail.status] },
              { key: '业务类型', value: detail.bizType },
              { key: '业务ID', value: detail.bizId },
              { key: '支付时间', value: detail.paidAt ? formatDateTime(detail.paidAt) : '-' },
              { key: '过期时间', value: detail.expiredAt ? formatDateTime(detail.expiredAt) : '-' },
              { key: '创建时间', value: formatDateTime(detail.createdAt) },
              { key: '错误信息', value: detail.errorMessage ?? '-' },
            ]}
          />
        )}
      </AppModal>

      <AppModal title="发起退款" visible={!!refundTarget} onOk={submitRefund} onCancel={() => setRefundTarget(null)} okButtonProps={{ loading: refundSubmitting, type: 'danger' }} width={480} closeOnEsc>
        {refundTarget && (
          <Form key={refundTarget.id} getFormApi={(api) => { refundFormApi.current = api; }} labelPosition="left" labelWidth={90} initValues={{ amountYuan: refundTarget.amount / 100 }}>
            <Form.Slot label="订单号">{refundTarget.orderNo}</Form.Slot>
            <Form.Slot label="可退金额">{yuan(refundTarget.amount)}</Form.Slot>
            <Form.InputNumber field="amountYuan" label="退款金额(元)" min={0.01} max={refundTarget.amount / 100} precision={2} style={{ width: '100%' }} rules={[{ required: true, message: '请输入退款金额' }]} />
            <Form.TextArea field="reason" label="退款原因" autosize rows={2} maxCount={256} placeholder="可选" />
          </Form>
        )}
      </AppModal>
    </div>
  );
}
