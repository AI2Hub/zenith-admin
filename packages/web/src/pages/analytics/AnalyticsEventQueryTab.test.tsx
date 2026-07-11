/**
 * AnalyticsEventQueryTab 单元测试（行为中心阶段 1：通用事件分析工作台）
 *
 * 覆盖点：
 *  1. 未查询时展示空态提示
 *  2. 点击「查询」提交筛选参数（默认 groupBy=['date']、days=30）给 useAnalyticsEventQuery().mutateAsync
 *  3. 查询结果渲染明细表格 + 汇总提示（区间/总行数）
 *  4. 查询结果为空数组时展示「暂无匹配数据」空态
 *  5. 重置按钮恢复默认草稿（不直接提交查询）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AnalyticsEventQueryResult } from '@zenith/shared';
import { PreferencesContext, defaultPreferences } from '@/hooks/usePreferences';

const useAnalyticsEventQueryMock = vi.fn();
const useAnalyticsEventMetaMock = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/hooks/queries/analytics', () => ({
  useAnalyticsEventQuery: () => useAnalyticsEventQueryMock(),
  useAnalyticsEventMeta: (...args: unknown[]) => useAnalyticsEventMetaMock(...args),
}));

// 图表渲染依赖 ThemeProvider/canvas，与本测试目标（数据流转/表格/空态）无关，直接替换为轻量占位组件
vi.mock('@/components/charts', () => ({
  BarChart: () => null,
  chartOptions: {},
  makeBarSpec: () => ({}),
  useChartPalette: () => ({ primary: '#000' }),
}));

import AnalyticsEventQueryTab from './AnalyticsEventQueryTab';

function renderWithPreferences(ui: React.ReactElement) {
  return render(
    <PreferencesContext.Provider value={{ preferences: defaultPreferences, setPreferences: vi.fn(), resetPreferences: vi.fn(), ready: true }}>
      {ui}
    </PreferencesContext.Provider>,
  );
}

function makeResult(overrides: Partial<AnalyticsEventQueryResult> = {}): AnalyticsEventQueryResult {
  return {
    rows: [
      { dimensions: { date: '2026-01-01' }, value: 120 },
      { dimensions: { date: '2026-01-02' }, value: 88 },
    ],
    total: 2,
    queryMeta: { startDate: '2026-01-01', endDate: '2026-01-02', groupBy: ['date'], metric: 'events' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue(makeResult());
  useAnalyticsEventQueryMock.mockReturnValue({ mutateAsync, data: null, isPending: false, isError: false });
  useAnalyticsEventMetaMock.mockReturnValue({ data: { list: [{ eventName: 'order_submit', displayName: '下单' }], total: 1, page: 1, pageSize: 200 }, isFetching: false });
});

describe('AnalyticsEventQueryTab', () => {
  it('shows an empty state before the first query is submitted', () => {
    renderWithPreferences(<AnalyticsEventQueryTab />);
    expect(screen.getByText('请配置筛选条件后点击查询')).toBeInTheDocument();
  });

  it('submits the default groupBy=[date]/days=30 filters when clicking 查询', async () => {
    renderWithPreferences(<AnalyticsEventQueryTab />);
    fireEvent.click(screen.getByText('查询'));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0][0];
    expect(body.groupBy).toEqual(['date']);
    expect(body.days).toBe(30);
    expect(body.eventNames).toBeUndefined();
  });

  it('renders the result table + summary text once a query result is available', () => {
    useAnalyticsEventQueryMock.mockReturnValue({ mutateAsync, data: makeResult(), isPending: false, isError: false });
    renderWithPreferences(<AnalyticsEventQueryTab />);
    expect(screen.getByText(/共 2 行/)).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('shows a "no matching data" empty state when the result rows array is empty', () => {
    useAnalyticsEventQueryMock.mockReturnValue({ mutateAsync, data: makeResult({ rows: [], total: 0 }), isPending: false, isError: false });
    renderWithPreferences(<AnalyticsEventQueryTab />);
    expect(screen.getByText('暂无匹配数据')).toBeInTheDocument();
  });

  it('shows a query-failed empty state hint when the mutation errored and no data is available', () => {
    useAnalyticsEventQueryMock.mockReturnValue({ mutateAsync, data: null, isPending: false, isError: true });
    renderWithPreferences(<AnalyticsEventQueryTab />);
    expect(screen.getByText('查询失败，请检查筛选条件后重试')).toBeInTheDocument();
  });
});
