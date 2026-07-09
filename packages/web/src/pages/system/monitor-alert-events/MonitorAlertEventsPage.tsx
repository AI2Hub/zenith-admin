import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Select, Tag } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { RotateCcw, Search } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { formatDateTime } from '@/utils/date';
import { renderEllipsis } from '@/utils/table-columns';
import { usePagination } from '@/hooks/usePagination';
import type { MonitorAlertEvent, MonitorMetric } from '@zenith/shared';
import { monitorAlertKeys, useMonitorAlertEventList } from '@/hooks/queries/monitor-alerts';
import {
  MONITOR_ALERT_LEVEL_CONFIG as LEVEL_CONFIG,
  MONITOR_BYTES_METRICS as BYTES_METRICS,
  MONITOR_METRIC_LABELS as METRIC_LABELS,
  MONITOR_METRIC_OPTIONS as METRIC_OPTIONS,
  MONITOR_PERCENT_METRICS as PERCENT_METRICS,
} from '../monitor-alerts/constants';
const OP_SYMBOL: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤' };

function fmt(metric: MonitorMetric, value: number): string {
  if (BYTES_METRICS.has(metric)) {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let v = value; let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${Math.round(v * 10) / 10} ${units[i]}`;
  }
  if (PERCENT_METRICS.has(metric)) return `${value}%`;
  if (metric === 'loopLag') return `${value} ms`;
  return `${value}`;
}

interface Filters { metric?: string; level?: string; status?: string; }

export default function MonitorAlertEventsPage() {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState<Filters>({});
  const [submittedFilters, setSubmittedFilters] = useState<Filters>({});
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const listQuery = useMonitorAlertEventList({
    page,
    pageSize,
    metric: submittedFilters.metric || undefined,
    level: submittedFilters.level || undefined,
    status: submittedFilters.status || undefined,
  });
  const data = listQuery.data ?? null;

  function handleSearch() {
    setPage(1);
    setSubmittedFilters(draftFilters);
    void queryClient.invalidateQueries({ queryKey: monitorAlertKeys.eventLists });
  }

  function handleReset() {
    setDraftFilters({});
    setSubmittedFilters({});
    setPage(1);
    void queryClient.invalidateQueries({ queryKey: monitorAlertKeys.eventLists });
  }

  const columns: ColumnProps<MonitorAlertEvent>[] = [
    { title: '触发时间', dataIndex: 'triggeredAt', width: 165, fixed: 'left', render: (t: string) => formatDateTime(t) },
    { title: '规则', dataIndex: 'ruleName', width: 160, render: renderEllipsis },
    {
      title: '触发条件', dataIndex: 'metric', width: 210,
      render: (_: unknown, r: MonitorAlertEvent) => (
        <span>
          <Tag size="small" type="ghost">{METRIC_LABELS[r.metric] ?? r.metric}</Tag>
          {' '}{OP_SYMBOL[r.operator] ?? r.operator} {fmt(r.metric, r.threshold)}
        </span>
      ),
    },
    { title: '实际值', dataIndex: 'value', width: 110, render: (v: number, r: MonitorAlertEvent) => <b>{fmt(r.metric, v)}</b> },
    { title: '级别', dataIndex: 'level', width: 80, render: (v: string) => <Tag color={LEVEL_CONFIG[v]?.color ?? 'grey'} size="small">{LEVEL_CONFIG[v]?.label ?? v}</Tag> },
    { title: '描述', dataIndex: 'message', width: 280, render: renderEllipsis },
    { title: '恢复时间', dataIndex: 'resolvedAt', width: 165, render: (t: string | null) => t ? formatDateTime(t) : <span style={{ color: 'var(--semi-color-text-2)' }}>—</span> },
    {
      title: '状态', dataIndex: 'status', width: 90, fixed: 'right',
      render: (s: string) => s === 'firing' ? <Tag color="red" size="small">告警中</Tag> : <Tag color="green" size="small">已恢复</Tag>,
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            <Select
              placeholder="全部指标"
              value={draftFilters.metric}
              onChange={(v) => setDraftFilters((p) => ({ ...p, metric: v as string }))}
              showClear
              style={{ width: 150 }}
              optionList={METRIC_OPTIONS}
            />
            <Select
              placeholder="全部级别"
              value={draftFilters.level}
              onChange={(v) => setDraftFilters((p) => ({ ...p, level: v as string }))}
              showClear
              style={{ width: 120 }}
              optionList={Object.entries(LEVEL_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
            />
            <Select
              placeholder="全部状态"
              value={draftFilters.status}
              onChange={(v) => setDraftFilters((p) => ({ ...p, status: v as string }))}
              showClear
              style={{ width: 120 }}
              optionList={[{ value: 'firing', label: '告警中' }, { value: 'resolved', label: '已恢复' }]}
            />
            <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
            <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
          </>
        )}
        mobilePrimary={(
          <>
            <Select
              placeholder="全部指标"
              value={draftFilters.metric}
              onChange={(v) => setDraftFilters((p) => ({ ...p, metric: v as string }))}
              showClear
              style={{ width: 150 }}
              optionList={METRIC_OPTIONS}
            />
            <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
          </>
        )}
        mobileFilters={(
          <>
            <Select
              placeholder="全部级别"
              value={draftFilters.level}
              onChange={(v) => setDraftFilters((p) => ({ ...p, level: v as string }))}
              showClear
              style={{ width: 120 }}
              optionList={Object.entries(LEVEL_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
            />
            <Select
              placeholder="全部状态"
              value={draftFilters.status}
              onChange={(v) => setDraftFilters((p) => ({ ...p, status: v as string }))}
              showClear
              style={{ width: 120 }}
              optionList={[{ value: 'firing', label: '告警中' }, { value: 'resolved', label: '已恢复' }]}
            />
          </>
        )}
        filterTitle="告警事件筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data?.list ?? []}
        loading={listQuery.isFetching}
        rowKey="id"
        size="small"
        empty="暂无告警记录"
        onRefresh={() => void listQuery.refetch()}
        refreshLoading={listQuery.isFetching}
        pagination={buildPagination(data?.total ?? 0)}
      />
    </div>
  );
}
