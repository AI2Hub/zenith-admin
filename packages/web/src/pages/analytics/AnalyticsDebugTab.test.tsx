/**
 * AnalyticsDebugTab 单元测试
 *
 * 覆盖点：
 *  1. 渲染事件调试流列表（事件名/来源/质量问题标签）
 *  2. 查询/重置触发 useAnalyticsDebugEvents 使用新的 eventName 参数调用
 *  3. 点击「详情」打开 SideSheet 并展示属性 JSON
 *  4. active=false 时仍然渲染（hook 内部据此决定是否轮询，由 hook 自身测试覆盖）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AnalyticsDebugEvent } from '@zenith/shared';
import { PreferencesContext, defaultPreferences } from '@/hooks/usePreferences';

const useAnalyticsDebugEventsMock = vi.fn();
vi.mock('@/hooks/queries/analytics', () => ({
  useAnalyticsDebugEvents: (...args: unknown[]) => useAnalyticsDebugEventsMock(...args),
}));

import AnalyticsDebugTab from './AnalyticsDebugTab';

function renderWithPreferences(ui: React.ReactElement) {
  return render(
    <PreferencesContext.Provider value={{ preferences: defaultPreferences, setPreferences: vi.fn(), resetPreferences: vi.fn(), ready: true }}>
      {ui}
    </PreferencesContext.Provider>,
  );
}

function makeEvent(overrides: Partial<AnalyticsDebugEvent> = {}): AnalyticsDebugEvent {
  return {
    id: 1,
    eventId: 'evt-1',
    eventType: 'custom',
    eventName: 'order_submit',
    source: 'web_admin',
    appId: 'admin',
    environment: 'production',
    distinctId: 'anon-1',
    memberId: null,
    userId: 1,
    pagePath: '/orders',
    properties: { amount: 100 },
    createdAt: '2024-01-01 10:00:00',
    issueTypes: ['missing_required'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAnalyticsDebugEventsMock.mockReturnValue({
    data: [makeEvent()],
    isFetching: false,
    refetch: vi.fn(),
  });
});

describe('AnalyticsDebugTab', () => {
  it('渲染事件调试流并展示质量问题标签', () => {
    renderWithPreferences(<AnalyticsDebugTab active />);
    expect(screen.getByText('order_submit')).toBeInTheDocument();
    expect(screen.getByText('anon-1')).toBeInTheDocument();
    expect(screen.getByText('缺失必填属性')).toBeInTheDocument();
  });

  it('查询按钮使用输入的事件名调用 hook', () => {
    renderWithPreferences(<AnalyticsDebugTab active />);
    const input = screen.getByPlaceholderText('事件名');
    fireEvent.change(input, { target: { value: 'order_submit' } });
    fireEvent.click(screen.getByText('查询'));
    const lastCallParams = useAnalyticsDebugEventsMock.mock.calls.at(-1)?.[0];
    expect(lastCallParams).toEqual({ limit: 50, eventName: 'order_submit' });
  });

  it('重置按钮清空事件名过滤', () => {
    renderWithPreferences(<AnalyticsDebugTab active />);
    const input = screen.getByPlaceholderText('事件名');
    fireEvent.change(input, { target: { value: 'order_submit' } });
    fireEvent.click(screen.getByText('查询'));
    fireEvent.click(screen.getByText('重置'));
    const lastCallParams = useAnalyticsDebugEventsMock.mock.calls.at(-1)?.[0];
    expect(lastCallParams).toEqual({ limit: 50, eventName: undefined });
  });

  it('点击详情打开 SideSheet 展示事件属性 JSON', () => {
    renderWithPreferences(<AnalyticsDebugTab active />);
    fireEvent.click(screen.getByText('详情'));
    expect(screen.getByText('事件详情')).toBeInTheDocument();
    const sheet = screen.getByText('事件详情').closest('.semi-sidesheet-inner') ?? document.body;
    expect(within(sheet as HTMLElement).getByText(/"amount": 100/)).toBeInTheDocument();
  });
});
