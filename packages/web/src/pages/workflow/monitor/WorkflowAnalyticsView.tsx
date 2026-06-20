import { useEffect, useState } from 'react';
import { Card, Empty, Spin, Typography, Select, Tag } from '@douyinfe/semi-ui';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { WorkflowAnalytics, WorkflowDefinition, WorkflowOverdueTask, PaginatedResponse } from '@zenith/shared';
import { request } from '@/utils/request';

const STATUS_META: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: '#8c8c8c' },
  running: { text: '审批中', color: '#3370ff' },
  approved: { text: '已通过', color: '#0dc87c' },
  rejected: { text: '已驳回', color: '#ff4d4f' },
  withdrawn: { text: '已撤回', color: '#faad14' },
  cancelled: { text: '已取消', color: '#8b5cf6' },
};

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}秒`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60); const mm = m % 60;
  if (h < 24) return `${h}小时${mm}分`;
  const d = Math.floor(h / 24); const hh = h % 24;
  return `${d}天${hh}小时`;
}

function Kpi({ label, value, danger, warn }: Readonly<{ label: string; value: string | number; danger?: boolean; warn?: boolean }>) {
  const color = danger ? '#ff4d4f' : warn ? '#faad14' : undefined;
  return (
    <Card style={{ flex: '1 1 150px', minWidth: 140 }} bodyStyle={{ padding: '14px 16px' }}>
      <Typography.Text type="tertiary" size="small">{label}</Typography.Text>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color }}>{value}</div>
    </Card>
  );
}

function ChartCard({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card style={{ flex: '1 1 420px', minWidth: 320 }} bodyStyle={{ padding: '12px 16px' }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>{title}</Typography.Text>
      {children}
    </Card>
  );
}

export default function WorkflowAnalyticsView({ definitions }: Readonly<{ definitions: WorkflowDefinition[] }>) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkflowAnalytics | null>(null);
  const [overdue, setOverdue] = useState<WorkflowOverdueTask[]>([]);
  const [definitionId, setDefinitionId] = useState<number | ''>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = definitionId === '' ? '' : `?definitionId=${definitionId}`;
    request.get<WorkflowAnalytics>(`/api/workflows/instances/analytics${qs}`)
      .then((res) => { if (!cancelled && res.code === 0) setData(res.data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const oqs = definitionId === '' ? '?pageSize=50' : `?pageSize=50&definitionId=${definitionId}`;
    request.get<PaginatedResponse<WorkflowOverdueTask>>(`/api/workflows/instances/overdue${oqs}`)
      .then((res) => { if (!cancelled && res.code === 0) setOverdue(res.data.list ?? []); });
    return () => { cancelled = true; };
  }, [definitionId]);

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  }
  if (!data) return <Empty title="暂无分析数据" style={{ padding: 60 }} />;

  const statusPie = data.statusCounts
    .filter((s) => s.count > 0)
    .map((s) => ({ name: STATUS_META[s.status]?.text ?? s.status, value: s.count, color: STATUS_META[s.status]?.color ?? '#999' }));

  const defBar = data.definitionStats.map((d) => ({ name: d.definitionName, 进行中: d.running, 已通过: d.approved, 已驳回: d.rejected }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Select
          placeholder="全部流程"
          showClear
          value={definitionId === '' ? undefined : definitionId}
          onChange={(v) => setDefinitionId((v as number) ?? '')}
          style={{ width: 220 }}
          optionList={definitions.map((d) => ({ label: d.name, value: d.id }))}
        />
      </div>

      {/* KPI */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label="流程实例总数" value={data.total} />
        <Kpi label="平均审批耗时" value={fmtDuration(data.avgDurationSec)} />
        <Kpi label="当前待办总数" value={data.pendingTaskCount} />
        <Kpi label="已超时待办" value={data.overdueTaskCount} danger={data.overdueTaskCount > 0} />
        <Kpi label="24h内即将超时" value={data.dueSoonTaskCount} warn={data.dueSoonTaskCount > 0} />
        <Kpi label="近 7 天发起" value={data.recentCreated} />
      </div>

      {/* 超时待办预警 */}
      <ChartCard title={`超时待办预警${overdue.length > 0 ? `（${overdue.length}）` : ''}`}>
        {overdue.length === 0 ? <Empty title="暂无超时待办" style={{ padding: 32 }} /> : (
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--semi-color-text-2)' }}>
                  <th style={{ padding: '6px 8px' }}></th>
                  <th style={{ padding: '6px 8px' }}>申请</th>
                  <th style={{ padding: '6px 8px' }}>节点</th>
                  <th style={{ padding: '6px 8px' }}>处理人</th>
                  <th style={{ padding: '6px 8px' }}>应处理时限</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>已超时</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((o) => {
                  const days = o.overdueSec / 86400;
                  const lamp = days >= 1 ? '#ff4d4f' : '#faad14';
                  return (
                    <tr key={o.taskId} style={{ borderTop: '1px solid var(--semi-color-border)' }}>
                      <td style={{ padding: '6px 8px' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: lamp }} /></td>
                      <td style={{ padding: '6px 8px' }}>{o.serialNo ? <Tag size="small" color="grey" style={{ marginRight: 4 }}>{o.serialNo}</Tag> : null}{o.instanceTitle}</td>
                      <td style={{ padding: '6px 8px' }}>{o.nodeName}</td>
                      <td style={{ padding: '6px 8px' }}>{o.assigneeName ?? '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--semi-color-text-2)' }}>{o.timeoutAt}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: lamp, fontWeight: 600 }}>{fmtDuration(o.overdueSec)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* 趋势 + 状态分布 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ChartCard title="近 14 天发起 / 完结趋势">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" name="发起" stroke="#3370ff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completed" name="完结" stroke="#0dc87c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="状态分布">
          {statusPie.length === 0 ? <Empty title="暂无数据" style={{ padding: 40 }} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statusPie.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* 各流程量 + 节点瓶颈 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ChartCard title="各流程实例量（Top 12）">
          {defBar.length === 0 ? <Empty title="暂无数据" style={{ padding: 40 }} /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, defBar.length * 34)}>
              <BarChart data={defBar} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} fontSize={12} />
                <YAxis type="category" dataKey="name" width={120} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="进行中" stackId="a" fill="#3370ff" />
                <Bar dataKey="已通过" stackId="a" fill="#0dc87c" />
                <Bar dataKey="已驳回" stackId="a" fill="#ff4d4f" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="节点瓶颈（平均处理时长 / 待办数）">
          {data.nodeBottlenecks.length === 0 ? <Empty title="暂无数据" style={{ padding: 40 }} /> : (
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--semi-color-text-2)' }}>
                    <th style={{ padding: '6px 8px' }}>节点</th>
                    <th style={{ padding: '6px 8px' }}>流程</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>平均时长</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>待办</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nodeBottlenecks.map((n) => (
                    <tr key={`${n.definitionId}-${n.nodeKey}`} style={{ borderTop: '1px solid var(--semi-color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{n.nodeName}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--semi-color-text-2)' }}>{n.definitionName}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtDuration(n.avgHandleSec)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: n.pendingCount > 0 ? '#faad14' : undefined }}>{n.pendingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      {/* 审批人工作量 */}
      <ChartCard title="审批人待办工作量（Top 10）">
        {data.approverWorkloads.length === 0 ? <Empty title="暂无待办" style={{ padding: 40 }} /> : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.approverWorkloads.length * 32)}>
            <BarChart data={data.approverWorkloads.map((a) => ({ name: a.userName, 待办: a.pendingCount }))} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={100} fontSize={12} />
              <Tooltip />
              <Bar dataKey="待办" fill="#3370ff" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
