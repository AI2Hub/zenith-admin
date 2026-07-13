import { useState, useRef } from 'react';
import { formatYuan, PAYMENT_CHANNEL_TAG_COLOR } from '@/utils/payment';
import type { CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DatePicker, Form, Input, Row, Col, Select, Skeleton, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import { Search, RotateCcw, ShieldCheck, RefreshCw, SlidersHorizontal } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import { formatDateTime, formatDateTimeForApi } from '@/utils/date';
import { usePagination } from '@/hooks/usePagination';
import { usePermission } from '@/hooks/usePermission';
import {
  paymentLedgerKeys,
  useAdjustPaymentAccount,
  useCheckPaymentAccounts,
  usePaymentAccounts,
  usePaymentLedgerList,
  usePaymentLedgerSummary,
  useRebuildPaymentAccounts,
} from '@/hooks/queries/payment-ledger';
import { PAYMENT_CHANNEL_LABELS, PAYMENT_CHANNEL_OPTIONS, PAYMENT_LEDGER_DIRECTION_LABELS, PAYMENT_LEDGER_TYPE_LABELS } from '@zenith/shared';
import type { PaymentAccountCheckRow, PaymentChannel, PaymentLedgerDirection, PaymentLedgerEntry, PaymentLedgerType } from '@zenith/shared';

const yuan = formatYuan;
const sectionStyle: CSSProperties = {
  background: 'var(--semi-color-bg-1)',
  border: '1px solid var(--semi-color-border)',
  borderRadius: 'var(--semi-border-radius-medium)',
  padding: '16px 20px',
};

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly sub?: string;
  readonly accent?: string;
}
function StatCard({ title, value, sub, accent }: StatCardProps) {
  return (
    <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', minHeight: 92, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? 'var(--semi-color-text-0)', lineHeight: 1.2 }}>{String(value)}</div>
      <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)', minHeight: 16 }}>{sub ?? ''}</div>
      <div style={{ fontSize: 13, color: 'var(--semi-color-text-1)', marginTop: 'auto' }}>{title}</div>
    </div>
  );
}

interface SearchParams {
  keyword: string;
  direction: string;
  type: string;
  channel: string;
  timeRange: [Date, Date] | null;
}
const defaultSearch: SearchParams = { keyword: '', direction: '', type: '', channel: '', timeRange: null };

export default function PaymentLedgerPage() {
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();
  const canView = hasPermission('payment:ledger:list');
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const [draftParams, setDraftParams] = useState<SearchParams>(defaultSearch);
  const [submittedParams, setSubmittedParams] = useState<SearchParams>(defaultSearch);

  function buildQuery(active: SearchParams): Record<string, string> {
    const q: Record<string, string> = {};
    if (active.keyword) q.keyword = active.keyword;
    if (active.direction) q.direction = active.direction;
    if (active.type) q.type = active.type;
    if (active.channel) q.channel = active.channel;
    if (active.timeRange) {
      q.startTime = formatDateTimeForApi(active.timeRange[0]);
      q.endTime = formatDateTimeForApi(active.timeRange[1]);
    }
    return q;
  }

  const filters = buildQuery(submittedParams);
  const listQuery = usePaymentLedgerList({ page, pageSize, ...filters }, canView);
  const summaryQuery = usePaymentLedgerSummary(filters, canView);
  const accountsQuery = usePaymentAccounts(canView);
  const data = listQuery.data?.list ?? [];
  const total = listQuery.data?.total ?? 0;
  const summary = summaryQuery.data ?? null;
  const accounts = accountsQuery.data ?? [];
  const loading = listQuery.isFetching || summaryQuery.isFetching;

  const canAdjust = hasPermission('payment:account:adjust');
  const adjustFormApi = useRef<FormApi | null>(null);
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [checkResult, setCheckResult] = useState<PaymentAccountCheckRow[] | null>(null);
  const checkMutation = useCheckPaymentAccounts();
  const rebuildMutation = useRebuildPaymentAccounts();
  const adjustMutation = useAdjustPaymentAccount();

  async function handleCheck() {
    const rows = await checkMutation.mutateAsync();
    setCheckResult(rows);
    const mismatch = rows.filter((r) => !r.match);
    if (mismatch.length === 0) Toast.success('余额核对一致');
    else Toast.warning(`发现 ${mismatch.length} 个账户余额与流水不一致`);
  }

  async function handleRebuild() {
    const res = await rebuildMutation.mutateAsync();
    setCheckResult(null);
    Toast.success(`已从流水重建 ${res.accounts} 个账户快照`);
  }

  async function handleAdjustOk() {
    let values: { channel: PaymentChannel; direction: 'in' | 'out'; amountYuan: number; remark?: string };
    try { values = (await adjustFormApi.current?.validate()) as typeof values; } catch { throw new Error('validation'); }
    await adjustMutation.mutateAsync({
      channel: values.channel,
      direction: values.direction,
      amount: Math.round(values.amountYuan * 100),
      remark: values.remark || undefined,
    });
    Toast.success('调账成功');
    setAdjustVisible(false);
  }

  function handleSearch() { setPage(1); setSubmittedParams(draftParams); void queryClient.invalidateQueries({ queryKey: paymentLedgerKeys.all }); }
  function handleReset() { setDraftParams(defaultSearch); setPage(1); setSubmittedParams(defaultSearch); void queryClient.invalidateQueries({ queryKey: paymentLedgerKeys.all }); }

  const columns: ColumnProps<PaymentLedgerEntry>[] = [
    { title: '流水号', dataIndex: 'entryNo', width: 190, render: (v: string) => <Typography.Text ellipsis={{ showTooltip: true }} copyable={{ content: v }} style={{ maxWidth: 170 }}>{v}</Typography.Text> },
    { title: '方向', dataIndex: 'direction', width: 90, render: (v: PaymentLedgerDirection) => <Tag color={v === 'in' ? 'green' : 'red'}>{PAYMENT_LEDGER_DIRECTION_LABELS[v]}</Tag> },
    { title: '类型', dataIndex: 'type', width: 100, render: (v: PaymentLedgerType) => PAYMENT_LEDGER_TYPE_LABELS[v] },
    { title: '金额', dataIndex: 'amount', width: 120, render: (v: number, r: PaymentLedgerEntry) => <Typography.Text type={r.direction === 'in' ? 'success' : 'danger'}>{yuan(v)}</Typography.Text> },
    { title: '订单号', dataIndex: 'orderNo', width: 180, render: (v: string | null) => v || '-' },
    { title: '退款单号', dataIndex: 'refundNo', width: 180, render: (v: string | null) => v || '-' },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: PaymentChannel | null) => (v ? <Tag color={PAYMENT_CHANNEL_TAG_COLOR[v]}>{PAYMENT_CHANNEL_LABELS[v]}</Tag> : '-') },
    { title: '业务类型', dataIndex: 'bizType', width: 120, render: (v: string | null) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (t: string) => formatDateTime(t) },
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="订单号..."
      value={draftParams.keyword}
      onChange={(v) => setDraftParams((p) => ({ ...p, keyword: v }))}
      showClear
      style={{ width: 200 }}
      onEnterPress={handleSearch}
    />
  );

  const renderDirectionFilter = () => (
    <Select
      placeholder="收支方向"
      value={draftParams.direction || undefined}
      onChange={(v) => setDraftParams((p) => ({ ...p, direction: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={Object.entries(PAYMENT_LEDGER_DIRECTION_LABELS).map(([value, label]) => ({ value, label }))}
    />
  );

  const renderTypeFilter = () => (
    <Select
      placeholder="流水类型"
      value={draftParams.type || undefined}
      onChange={(v) => setDraftParams((p) => ({ ...p, type: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={Object.entries(PAYMENT_LEDGER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
    />
  );

  const renderChannelFilter = () => (
    <Select
      placeholder="全部渠道"
      value={draftParams.channel || undefined}
      onChange={(v) => setDraftParams((p) => ({ ...p, channel: (v as string) ?? '' }))}
      showClear
      style={{ width: 120 }}
      optionList={PAYMENT_CHANNEL_OPTIONS}
    />
  );

  const renderTimeRangeFilter = () => (
    <DatePicker
      type="dateTimeRange"
      placeholder={['开始时间', '结束时间']}
      value={draftParams.timeRange ?? undefined}
      onChange={(v) => setDraftParams((p) => ({ ...p, timeRange: v ? (v as [Date, Date]) : null }))}
      style={{ width: 330 }}
    />
  );

  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch} disabled={!canView}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset} disabled={!canView}>重置</Button>;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 16 }}>
        {loading && !summary ? (
          <Skeleton
            loading
            active
            placeholder={
              <Row gutter={[16, 16]} type="flex">
                {Array.from({ length: 4 }, (_, i) => `sk-ledger-${i}`).map((key) => (
                  <Col key={key} xs={24} sm={12} xl={6}>
                    <div style={{ ...sectionStyle, minHeight: 92, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Skeleton.Title style={{ width: '60%', marginBottom: 4 }} />
                      <Skeleton.Paragraph rows={1} style={{ width: '40%', marginBottom: 0 }} />
                    </div>
                  </Col>
                ))}
              </Row>
            }
          >{null}</Skeleton>
        ) : (
          <Row gutter={[16, 16]} type="flex">
            <Col xs={24} sm={12} xl={6}>
              <StatCard title="收入" value={summary ? yuan(summary.inAmount) : '—'} accent="#10b981" />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title="支出" value={summary ? yuan(summary.outAmount) : '—'} accent="#f97316" />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title="净额" value={summary ? yuan(summary.netAmount) : '—'} accent={summary && summary.netAmount < 0 ? '#ef4444' : '#3b82f6'} />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <StatCard title="笔数" value={summary?.count ?? '—'} />
            </Col>
          </Row>
        )}
      </div>

      {/* 渠道资金账户（待结算/可用/冻结快照，随台账流水联动） */}
      <div style={{ ...sectionStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: accounts.length > 0 ? 12 : 0 }}>
          <Typography.Title heading={6} style={{ margin: 0 }}>渠道资金账户</Typography.Title>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon={<ShieldCheck size={14} />} loading={checkMutation.isPending} onClick={() => void handleCheck()}>余额核对</Button>
            {canAdjust && (
              <>
                <Button icon={<RefreshCw size={14} />} loading={rebuildMutation.isPending} onClick={() => void handleRebuild()}>重建快照</Button>
                <Button type="primary" icon={<SlidersHorizontal size={14} />} onClick={() => setAdjustVisible(true)}>人工调账</Button>
              </>
            )}
          </div>
        </div>
        {accounts.length === 0 ? (
          <Typography.Text type="tertiary">暂无账户（发生首笔资金流水后自动建账，或点击「重建快照」从存量流水初始化）</Typography.Text>
        ) : (
          <Row gutter={[16, 16]} type="flex">
            {accounts.map((a) => {
              const check = checkResult?.find((c) => c.channel === a.channel);
              return (
                <Col key={a.id} xs={24} sm={12} xl={8}>
                  <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-medium)', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Tag color={PAYMENT_CHANNEL_TAG_COLOR[a.channel]}>{PAYMENT_CHANNEL_LABELS[a.channel]}</Tag>
                      {check && (check.match ? <Tag color="green">核对一致</Tag> : <Tag color="red">快照不符</Tag>)}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                      <div>待结算 <strong>{yuan(a.pendingSettle)}</strong></div>
                      <div>可用 <strong style={{ color: '#10b981' }}>{yuan(a.available)}</strong></div>
                      <div>冻结 <strong>{yuan(a.frozen)}</strong></div>
                    </div>
                    {check && !check.match && (
                      <Typography.Text type="danger" size="small" style={{ display: 'block', marginTop: 6 }}>
                        流水口径：待结算 {yuan(check.pendingSettleComputed)} / 可用 {yuan(check.availableComputed)}
                      </Typography.Text>
                    )}
                  </div>
                </Col>
              );
            })}
          </Row>
        )}
      </div>

      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderDirectionFilter()}
            {renderTypeFilter()}
            {renderChannelFilter()}
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
            {renderDirectionFilter()}
            {renderTypeFilter()}
            {renderChannelFilter()}
            {renderTimeRangeFilter()}
          </>
        )}
        filterTitle="资金台账筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      {!canView && (
        <Banner
          type="warning"
          bordered
          closeIcon={null}
          description="当前账号缺少「payment:ledger:list」权限，无法查看资金台账。"
          style={{ marginBottom: 12 }}
        />
      )}

      <ConfigurableTable
        bordered columns={columns} dataSource={data} loading={listQuery.isFetching} rowKey="id" size="small" empty="暂无数据"
        onRefresh={() => { void listQuery.refetch(); void summaryQuery.refetch(); void accountsQuery.refetch(); }} refreshLoading={loading} pagination={buildPagination(total)}
      />

      <AppModal title="人工调账" visible={adjustVisible} onOk={handleAdjustOk} onCancel={() => setAdjustVisible(false)} okButtonProps={{ loading: adjustMutation.isPending }} width={480} closeOnEsc>
        <Banner type="warning" closeIcon={null} style={{ marginBottom: 16 }}
          description="调账将记入 adjust 资金流水并同步变更该渠道账户的可用余额，操作可审计。" />
        <Form key={adjustVisible ? 'adjust' : 'closed'} getFormApi={(api) => { adjustFormApi.current = api; }} initValues={{ direction: 'in' }} labelPosition="left" labelWidth={100}>
          <Form.Select field="channel" label="渠道" style={{ width: '100%' }} optionList={PAYMENT_CHANNEL_OPTIONS} rules={[{ required: true, message: '请选择渠道' }]} />
          <Form.Select field="direction" label="方向" style={{ width: '100%' }}
            optionList={[{ value: 'in', label: '调增（入账）' }, { value: 'out', label: '调减（出账）' }]} rules={[{ required: true, message: '请选择方向' }]} />
          <Form.InputNumber field="amountYuan" label="金额(元)" min={0.01} step={0.01} precision={2} style={{ width: '100%' }} rules={[{ required: true, message: '请输入调账金额' }]} />
          <Form.TextArea field="remark" label="调账原因" autosize rows={2} placeholder="建议填写，便于审计追溯" />
        </Form>
      </AppModal>
    </div>
  );
}
