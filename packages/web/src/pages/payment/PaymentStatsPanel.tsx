import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Row, Col, Select } from '@douyinfe/semi-ui';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { request } from '@/utils/request';
import { PAYMENT_CHANNEL_LABELS, PAYMENT_ORDER_STATUS_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentOrderStatus, PaymentStats, PaymentTrendPoint } from '@zenith/shared';

const yuan = (cents: number) => `¥${((Number(cents) || 0) / 100).toFixed(2)}`;

const CHANNEL_COLORS: Record<string, string> = { wechat: '#10b981', alipay: '#3b82f6' };
const STATUS_COLORS: Record<string, string> = {
  pending: '#9ca3af', paying: '#3b82f6', success: '#10b981', closed: '#6b7280',
  refunding: '#f59e0b', refunded: '#f97316', failed: '#ef4444',
};

const DAYS_OPTIONS = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
];

const sectionStyle: React.CSSProperties = {
  background: 'var(--semi-color-bg-1)',
  border: '1px solid var(--semi-color-border)',
  borderRadius: 6,
  padding: '16px 20px',
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: 12,
};
const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-2)', border: '1px solid var(--semi-color-border)', borderRadius: 6, fontSize: 12,
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

export default function PaymentStatsPanel() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [trend, setTrend] = useState<PaymentTrendPoint[]>([]);
  const [days, setDays] = useState(30);

  const fetchStats = useCallback(async () => {
    const res = await request.get<PaymentStats>('/api/payment/stats');
    if (res.code === 0) setStats(res.data);
  }, []);

  const fetchTrend = useCallback(async (d: number) => {
    const res = await request.get<PaymentTrendPoint[]>(`/api/payment/trend?days=${d}`);
    if (res.code === 0) setTrend(res.data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchTrend(days)]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDaysChange(d: number) {
    setDays(d);
    void fetchTrend(d);
  }

  const channelData = (stats?.byChannel ?? []).map((c) => ({
    name: PAYMENT_CHANNEL_LABELS[c.channel as PaymentChannel] ?? c.channel,
    amount: c.amount,
    count: c.count,
    fill: CHANNEL_COLORS[c.channel] ?? '#6b7280',
  }));
  const statusData = (stats?.byStatus ?? []).map((s) => ({
    name: PAYMENT_ORDER_STATUS_LABELS[s.status as PaymentOrderStatus] ?? s.status,
    value: s.count,
    fill: STATUS_COLORS[s.status] ?? '#6b7280',
  }));
  const trendData = trend.map((p) => ({
    date: p.date.slice(5),
    amount: Number((p.amount / 100).toFixed(2)),
    refundAmount: Number((p.refundAmount / 100).toFixed(2)),
    count: p.count,
  }));

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 汇总卡片 */}
        <Row gutter={[16, 16]} type="flex">
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="累计成功金额" value={stats ? yuan(stats.totalAmount) : '—'} accent="#10b981" />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="今日成功金额" value={stats ? yuan(stats.todayAmount) : '—'} sub={stats ? `${stats.todayCount} 笔` : ''} />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="支付成功率" value={stats ? `${stats.successRate}%` : '—'} sub={stats ? `${stats.successCount}/${stats.orderCount} 单` : ''} accent="#3b82f6" />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="累计退款" value={stats ? yuan(stats.refundAmount) : '—'} sub={stats ? `${stats.refundCount} 笔` : ''} accent="#f97316" />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="退款率" value={stats ? `${stats.refundRate}%` : '—'} accent={stats && stats.refundRate > 20 ? '#ef4444' : undefined} />
          </Col>
          <Col xs={24} sm={12} xl={4}>
            <StatCard title="成功笔均" value={stats ? yuan(stats.avgAmount) : '—'} />
          </Col>
        </Row>

        {/* 收款趋势 */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>收款趋势</div>
            <Select size="small" value={days} onChange={(v) => handleDaysChange(v as number)} optionList={DAYS_OPTIONS} style={{ width: 130 }} />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData} margin={{ left: -6, right: 16 }}>
              <defs>
                <linearGradient id="payAmt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="payRefund" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`¥${v}`, n === 'amount' ? '收款金额' : '退款金额']} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" name="收款金额" stroke="#10b981" strokeWidth={2} fill="url(#payAmt)" />
              <Area type="monotone" dataKey="refundAmount" name="退款金额" stroke="#f97316" strokeWidth={2} fill="url(#payRefund)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 渠道金额分布 + 订单状态分布 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>渠道成功金额分布</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={channelData} margin={{ left: -6, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => (n === 'amount' ? [yuan(Number(v)), '成功金额'] : [`${v} 单`, '订单数'])} />
                  <Bar dataKey="amount" name="amount" radius={[3, 3, 0, 0]}>
                    {channelData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>订单状态分布</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={86} paddingAngle={2}>
                    {statusData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} 单`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>
      </div>
    </Spin>
  );
}
