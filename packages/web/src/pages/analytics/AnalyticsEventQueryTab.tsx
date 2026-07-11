/**
 * 行为中心阶段 1：通用事件分析工作台 —— 自定义事件 + 维度 + 指标查询，展示图表 + 明细表格。
 */
import { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Empty, InputNumber, Select, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import { BarChart, chartOptions, makeBarSpec, useChartPalette } from '@/components/charts';
import { ConfigurableTable } from '@/components/ConfigurableTable';
import { formatDateForApi } from '@/utils/date';
import { useAnalyticsEventMeta, useAnalyticsEventQuery } from '@/hooks/queries/analytics';
import type {
  AnalyticsEventQueryGroupByField,
  AnalyticsEventQueryInput,
  AnalyticsEventQueryMetric,
  AnalyticsEventQueryRow,
} from '@zenith/shared';
import {
  ANALYTICS_DEVICE_TYPE_OPTIONS,
  ANALYTICS_ENVIRONMENT_OPTIONS,
  ANALYTICS_EVENT_QUERY_GROUP_BY_LABELS,
  ANALYTICS_EVENT_QUERY_GROUP_BY_OPTIONS,
  ANALYTICS_EVENT_QUERY_METRIC_OPTIONS,
  ANALYTICS_EVENT_SOURCE_OPTIONS,
} from '@zenith/shared';

const DAY_OPTIONS = [7, 14, 30, 90].map((value) => ({ value, label: `近 ${value} 天` }));

interface EventQueryDraft {
  days: number;
  dateRange?: [Date, Date];
  eventNames: string[];
  source?: string;
  appId?: string;
  environment?: string;
  deviceType?: string;
  groupBy: AnalyticsEventQueryGroupByField[];
  metric: AnalyticsEventQueryMetric;
  limit: number;
}

const defaultDraft: EventQueryDraft = {
  days: 30,
  eventNames: [],
  groupBy: ['date'],
  metric: 'events',
  limit: 100,
};

function rowKey(row?: AnalyticsEventQueryRow, index?: number): string {
  if (!row) return String(index ?? 0);
  return `${Object.values(row.dimensions).join('|')}-${index ?? 0}`;
}

export default function AnalyticsEventQueryTab() {
  const [draft, setDraft] = useState<EventQueryDraft>(defaultDraft);
  const palette = useChartPalette();
  const queryMutation = useAnalyticsEventQuery();
  const result = queryMutation.data ?? null;
  const loading = queryMutation.isPending;

  // 事件名 lookup：从事件字典拉取，供多选下拉使用（最多展示 200 条，业务量级下足够覆盖）
  const eventMetaQuery = useAnalyticsEventMeta({ page: 1, pageSize: 200 });
  const eventNameOptions = useMemo(
    () => (eventMetaQuery.data?.list ?? []).map((m) => ({ value: m.eventName, label: m.displayName ? `${m.displayName}（${m.eventName}）` : m.eventName })),
    [eventMetaQuery.data?.list],
  );

  const updateDraft = <K extends keyof EventQueryDraft>(key: K, value: EventQueryDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => setDraft(defaultDraft);

  const handleQuery = async () => {
    const body: AnalyticsEventQueryInput = {
      eventNames: draft.eventNames.length ? draft.eventNames.slice(0, 20) : undefined,
      source: (draft.source as AnalyticsEventQueryInput['source']) || undefined,
      appId: draft.appId?.trim() || undefined,
      environment: (draft.environment as AnalyticsEventQueryInput['environment']) || undefined,
      deviceType: (draft.deviceType as AnalyticsEventQueryInput['deviceType']) || undefined,
      groupBy: draft.groupBy.length ? draft.groupBy : ['date'],
      metric: draft.metric,
      limit: draft.limit,
    };
    if (draft.dateRange) {
      body.startDate = formatDateForApi(draft.dateRange[0]);
      body.endDate = formatDateForApi(draft.dateRange[1]);
    } else {
      body.days = draft.days;
    }
    await queryMutation.mutateAsync(body);
  };

  const primaryDim = result?.queryMeta.groupBy[0];
  const metricLabel = ANALYTICS_EVENT_QUERY_METRIC_OPTIONS.find((o) => o.value === (result?.queryMeta.metric ?? draft.metric))?.label ?? '指标值';

  const chartData = useMemo(
    () => (result?.rows ?? []).map((row) => ({ __label: primaryDim ? row.dimensions[primaryDim] ?? '–' : '–', value: row.value })),
    [result?.rows, primaryDim],
  );

  const barSpec = useMemo(() => makeBarSpec({
    data: chartData,
    xField: '__label',
    series: [{ field: 'value', name: metricLabel, color: palette.primary }],
    palette,
    tooltip: { value: (v) => String(Math.round(Number(v))) },
  }), [chartData, metricLabel, palette]);

  const columns: ColumnProps<AnalyticsEventQueryRow>[] = useMemo(() => {
    const groupBy = result?.queryMeta.groupBy ?? draft.groupBy;
    const dimCols: ColumnProps<AnalyticsEventQueryRow>[] = groupBy.map((dim) => ({
      title: ANALYTICS_EVENT_QUERY_GROUP_BY_LABELS[dim] ?? dim,
      dataIndex: dim,
      render: (_: unknown, record: AnalyticsEventQueryRow) => record.dimensions[dim] ?? '–',
    }));
    return [
      ...dimCols,
      { title: metricLabel, dataIndex: 'value', width: 140, render: (value: number) => Math.round(value).toLocaleString() },
    ];
  }, [result?.queryMeta.groupBy, draft.groupBy, metricLabel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Typography.Title heading={6}>事件分析</Typography.Title>
      <Typography.Text type="tertiary" size="small">
        自由组合事件、维度与指标进行探索性分析；支持最多 2 个分组维度、10 个属性过滤条件（属性过滤暂通过分群/漏斗页配置，工作台先支持核心维度）。
      </Typography.Text>
      <Card bodyStyle={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <Typography.Text type="tertiary" size="small">事件（最多 20 个，留空表示全部）</Typography.Text>
            <Select
              multiple
              filter
              placeholder="全部事件"
              value={draft.eventNames}
              optionList={eventNameOptions}
              onChange={(v) => updateDraft('eventNames', (v as string[]) ?? [])}
              loading={eventMetaQuery.isFetching}
              showClear
              style={{ width: '100%' }}
              maxTagCount={2}
            />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">分组维度（1~2 个）</Typography.Text>
            <Select
              multiple
              placeholder="按日期"
              value={draft.groupBy}
              optionList={ANALYTICS_EVENT_QUERY_GROUP_BY_OPTIONS}
              onChange={(v) => updateDraft('groupBy', ((v as AnalyticsEventQueryGroupByField[]) ?? []).slice(0, 2))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">指标</Typography.Text>
            <Select value={draft.metric} optionList={ANALYTICS_EVENT_QUERY_METRIC_OPTIONS} onChange={(v) => updateDraft('metric', v as AnalyticsEventQueryMetric)} style={{ width: '100%' }} />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">来源</Typography.Text>
            <Select placeholder="全部来源" value={draft.source} optionList={ANALYTICS_EVENT_SOURCE_OPTIONS} onChange={(v) => updateDraft('source', v as string)} showClear style={{ width: '100%' }} />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">环境</Typography.Text>
            <Select placeholder="全部环境" value={draft.environment} optionList={ANALYTICS_ENVIRONMENT_OPTIONS} onChange={(v) => updateDraft('environment', v as string)} showClear style={{ width: '100%' }} />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">设备</Typography.Text>
            <Select placeholder="全部设备" value={draft.deviceType} optionList={ANALYTICS_DEVICE_TYPE_OPTIONS} onChange={(v) => updateDraft('deviceType', v as string)} showClear style={{ width: '100%' }} />
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">日期</Typography.Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                value={draft.dateRange ? undefined : draft.days}
                placeholder="最近 N 天"
                optionList={DAY_OPTIONS}
                onChange={(v) => setDraft((prev) => ({ ...prev, days: Number(v), dateRange: undefined }))}
                style={{ width: 130 }}
              />
              <DatePicker
                type="dateRange"
                placeholder={['开始日期', '结束日期']}
                value={draft.dateRange}
                onChange={(v) => setDraft((prev) => ({ ...prev, dateRange: v as [Date, Date] }))}
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div>
            <Typography.Text type="tertiary" size="small">结果行数上限</Typography.Text>
            <InputNumber value={draft.limit} min={1} max={200} onChange={(v) => updateDraft('limit', Number(v) || 100)} style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Button type="primary" icon={<Search size={14} />} loading={loading} onClick={() => void handleQuery()}>查询</Button>
          <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
        </div>
      </Card>

      <Card title="分析结果" bodyStyle={{ padding: 16 }}>
        {!result ? (
          <Empty description={queryMutation.isError ? '查询失败，请检查筛选条件后重试' : '请配置筛选条件后点击查询'} />
        ) : result.rows.length === 0 ? (
          <Empty description="暂无匹配数据" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="tertiary" size="small">
              区间 {result.queryMeta.startDate} ~ {result.queryMeta.endDate} · 共 {result.total} 行
            </Typography.Text>
            {result.queryMeta.groupBy.length === 1 && (
              <BarChart {...barSpec} options={chartOptions} height={280} />
            )}
            <ConfigurableTable
              bordered
              rowKey={rowKey}
              columns={columns}
              dataSource={result.rows}
              pagination={false}
              scroll={{ y: 420 }}
              empty="暂无数据"
            />
          </div>
        )}
      </Card>
    </div>
  );
}
