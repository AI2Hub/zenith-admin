/**
 * 首页仪表盘图表区（仅管理员可见的两组 VChart 数据视图）。
 *
 * 独立成懒加载 chunk：'@/components/charts' 模块求值即接入 VChart 主题，
 * 会拖入 ~1.9MB 的 @visactor 依赖树。拆出后 DashboardPage 主体
 * （欢迎区/统计概览/公告/日历）先渲染，图表随本 chunk 就绪后流式补齐。
 *
 * 两组图表都可点击下钻到对应列表页：折线点位 → 该天该状态的登录日志，
 * 饼图扇区 → 该模块的操作日志；地址拼装见 ./dashboard-drilldown，
 * 目标页用 useListDeepLink 消费后即从地址栏移除。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Skeleton, Empty, Tooltip } from '@douyinfe/semi-ui';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import {
  LineChart,
  chartOptions,
  makeLineSpec,
  useChartPalette,
} from '@/components/charts';
import { ModuleOperationPie } from '@/components/logs/ModuleOperationPie';
import type { DashboardCharts } from '@zenith/shared/analytics';
import { shortDate } from '@/utils/date';
import { recentDays, monthDayLabel } from './dashboard-days';
import { LOGIN_TREND_SERIES, loginLogsDrillUrl, operationLogsDrillUrl } from './dashboard-drilldown';

const { Text } = Typography;

const chartSkeleton = (
  <div className="dashboard-chart-placeholder">
    <Skeleton active loading placeholder={
      <div style={{ width: '100%', height: 200, padding: '12px 0' }}>
        <Skeleton.Paragraph rows={6} style={{ width: '100%' }} />
      </div>
    } />
  </div>
);

interface DashboardChartsRowProps {
  readonly charts: DashboardCharts | null;
  readonly chartsLoading: boolean;
}

/** 折线点位：多系列宽表经 wideToLong 摊平时保留了原始行，因此日期与系列名都能取到 */
interface LoginTrendPoint {
  readonly date?: string;
  readonly __type?: string;
}

export default function DashboardChartsRow({ charts, chartsLoading }: DashboardChartsRowProps) {
  const palette = useChartPalette();
  const navigate = useNavigate();

  // 切换范围与登录趋势同起止（含今天），默认选中今天
  const days = useMemo(() => recentDays(), []);
  const [selectedDate, setSelectedDate] = useState(() => days[days.length - 1]?.date ?? '');
  const selectedDay = days.find((day) => day.date === selectedDate);

  const operationRows = charts?.operationDistribution;

  /** 每天的总操作次数，header 的「共 N 次」直接取用 */
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of operationRows ?? []) map.set(row.date, (map.get(row.date) ?? 0) + row.count);
    return map;
  }, [operationRows]);

  /** 七天数据一次取回，切日期只在本地切片，不再请求也不闪加载态 */
  const selectedDistribution = useMemo(
    () => (operationRows ?? [])
      .filter((row) => row.date === selectedDate)
      .map(({ module, count }) => ({ module, count })),
    [operationRows, selectedDate],
  );
  const selectedTotal = countsByDate.get(selectedDate) ?? 0;

  const loginTrendSpec = useMemo(() => makeLineSpec({
    data: charts?.loginTrend ?? [],
    xField: 'date',
    series: LOGIN_TREND_SERIES.map(({ field, name, color }) => ({ field, name, color })),
    palette,
    point: true,
    axis: { xLabel: shortDate },
    tooltip: { title: (x) => `日期：${x}` },
  }), [charts?.loginTrend, palette]);

  /** 点空白 / 轴标签 / 图例时拿不到 date，这时不跳转 */
  function drillLoginTrend(point: LoginTrendPoint | undefined) {
    if (!point?.date) return;
    navigate(loginLogsDrillUrl(point.date, point.__type ?? ''));
  }

  /** 左右箭头的边界与标题：日期与星期固定宽度，箭头位置不会随次数变化 */
  const selectedIndex = days.findIndex((day) => day.date === selectedDate);
  const previousDay = selectedIndex > 0 ? days[selectedIndex - 1] : undefined;
  const nextDay = selectedIndex >= 0 && selectedIndex < days.length - 1 ? days[selectedIndex + 1] : undefined;
  const selectedDayLabel = `${monthDayLabel(selectedDate)} ${selectedDay?.weekday ?? ''}`.trim();

  function renderOperationPie() {
    if (chartsLoading) return (
      <div className="dashboard-chart-placeholder">
        <Skeleton active loading placeholder={
          <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'flex-end', gap: 12, padding: '0 8px' }}>
            {[60, 80, 45, 90, 55, 70].map((h) => (
              <Skeleton.Button key={h} style={{ flex: 1, height: `${h}%`, borderRadius: 'var(--semi-border-radius-small)' }} />
            ))}
          </div>
        } />
      </div>
    );
    return (
      <ModuleOperationPie
        data={selectedDistribution}
        height={200}
        onSliceClick={(module) => navigate(operationLogsDrillUrl(module, selectedDate))}
        empty={<div className="dashboard-chart-placeholder"><Empty description="暂无操作记录" /></div>}
      />
    );
  }

  return (
    <div className="dashboard-charts-row">
      <section className="dashboard-chart-section">
        <header className="dashboard-section-header">
          <Text strong>7 天登录趋势</Text>
          <span className="dashboard-section-meta">成功 / 失败 · 点击数据点看日志</span>
        </header>
        {chartsLoading
          ? chartSkeleton
          : (
            <LineChart
              {...loginTrendSpec}
              options={chartOptions}
              height={200}
              onClick={(e) => drillLoginTrend(e?.datum as LoginTrendPoint | undefined)}
            />
          )
        }
      </section>

      <section className="dashboard-chart-section">
        <header className="dashboard-section-header">
          <div className="dashboard-section-heading">
            <Text strong>操作分布</Text>
            <Tooltip content="按模块统计所选日期；点击扇区查看当天该模块的操作日志" position="top">
              <Info size={13} style={{ color: 'var(--semi-color-text-2)', cursor: 'help' }} />
            </Tooltip>
            {chartsLoading ? null : <span className="dashboard-section-meta">共 {selectedTotal} 次</span>}
          </div>
          <div className="dashboard-op-nav">
            <Button
              theme="borderless"
              size="small"
              className="dashboard-op-nav__arrow"
              icon={<ChevronLeft size={14} />}
              aria-label="前一天"
              title={previousDay ? `前一天：${monthDayLabel(previousDay.date)} ${previousDay.weekday}` : '已是最早一天'}
              disabled={!previousDay}
              onClick={() => previousDay && setSelectedDate(previousDay.date)}
            />
            <span className="dashboard-op-nav__label" aria-live="polite">{selectedDayLabel}</span>
            <Button
              theme="borderless"
              size="small"
              className="dashboard-op-nav__arrow"
              icon={<ChevronRight size={14} />}
              aria-label="后一天"
              title={nextDay ? `后一天：${monthDayLabel(nextDay.date)} ${nextDay.weekday}` : '已是最新一天'}
              disabled={!nextDay}
              onClick={() => nextDay && setSelectedDate(nextDay.date)}
            />
          </div>
        </header>
        {renderOperationPie()}
      </section>
    </div>
  );
}
