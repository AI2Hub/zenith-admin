/**
 * hooks/queries/analytics.ts —— 留存双口径（mode）query key + 事件分析工作台/漏斗 mutation 单测。
 *
 * 覆盖点：
 *  1. analyticsKeys.retention(days, mode) 对不同 mode 产出不同的 query key（保证切换口径触发重新拉取，
 *     而不是复用另一口径的缓存）
 *  2. useAnalyticsRetention 默认 mode='first_seen'，且请求 URL 携带 mode 参数
 *  3. useAnalyticsRetention 显式传入 mode='window_first' 时请求 URL 与 query key 均切换
 *  4. useAnalyticsEventQuery 是 mutation，POST 到 /api/analytics/events/query 并透传 body
 *  5. useAnalyzeFunnel 是 mutation，POST 到 /api/analytics/funnel 并透传 body（含新增的 conversionWindowHours/segmentId）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const get = vi.fn();
const post = vi.fn();

vi.mock('@/utils/request', () => ({ request: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import { analyticsKeys, useAnalyticsRetention, useAnalyticsEventQuery, useAnalyzeFunnel } from './analytics';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ code: 0, message: 'success', data: { cohorts: [], periods: [], mode: 'first_seen' } });
  post.mockResolvedValue({ code: 0, message: 'success', data: {} });
});

describe('analyticsKeys.retention — mode 纳入 query key', () => {
  it('produces distinct keys for first_seen vs window_first so switching the caliber refetches instead of reusing stale cache', () => {
    const keyFirstSeen = analyticsKeys.retention(14, 'first_seen');
    const keyWindowFirst = analyticsKeys.retention(14, 'window_first');
    expect(keyFirstSeen).not.toEqual(keyWindowFirst);
    expect(keyFirstSeen).toContain('first_seen');
    expect(keyWindowFirst).toContain('window_first');
  });
});

describe('useAnalyticsRetention', () => {
  it('defaults to mode=first_seen and includes it in both the query key and the request URL', async () => {
    const { result } = renderHook(() => useAnalyticsRetention(14), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(expect.stringContaining('mode=first_seen'));
  });

  it('switches to mode=window_first when explicitly requested', async () => {
    const { result } = renderHook(() => useAnalyticsRetention(14, 'window_first'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(expect.stringContaining('mode=window_first'));
  });
});

describe('useAnalyticsEventQuery — 通用事件分析工作台 mutation', () => {
  it('POSTs the query body verbatim to /api/analytics/events/query', async () => {
    const { result } = renderHook(() => useAnalyticsEventQuery(), { wrapper: wrapper() });
    const body = { groupBy: ['eventName' as const], metric: 'uv' as const, days: 7 };
    await result.current.mutateAsync(body);
    expect(post).toHaveBeenCalledWith('/api/analytics/events/query', body);
  });
});

describe('useAnalyzeFunnel — 有序转化漏斗 mutation（新增 conversionWindowHours/segmentId 透传）', () => {
  it('POSTs the full funnel query including the new conversionWindowHours and segmentId fields', async () => {
    const { result } = renderHook(() => useAnalyzeFunnel(), { wrapper: wrapper() });
    const body = {
      steps: [{ label: '浏览', eventName: 'view' }, { label: '下单', eventName: 'order' }],
      conversionWindowHours: 24,
      segmentId: 7,
    };
    await result.current.mutateAsync(body as never);
    expect(post).toHaveBeenCalledWith('/api/analytics/funnel', body);
  });
});
