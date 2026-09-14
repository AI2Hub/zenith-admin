import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BaseDatePicker from '@douyinfe/semi-ui/lib/es/datePicker/datePicker';
import { PreferencesProvider } from './PreferencesProvider';
import { usePreferences } from './usePreferences';
import { createTestQueryClient, createWrapper } from '@/test-utils/query-harness';

vi.mock('@/lib/contract-query', () => ({
  api: vi.fn(() => Promise.resolve(null)),
}));

const base = BaseDatePicker as unknown as { defaultProps: { weekStartsOn: number } };

async function setup() {
  const client = createTestQueryClient();
  const QueryWrapper = createWrapper(client);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryWrapper, null, createElement(PreferencesProvider, null, children));
  const hook = renderHook(() => usePreferences(), { wrapper });
  // 等挂载时的服务端偏好拉取（mock 为 null）落定，避免 ready 状态更新落在 act 之外
  await act(async () => { await Promise.resolve(); });
  return { client, hook };
}

beforeEach(() => {
  localStorage.clear();
  base.defaultProps.weekStartsOn = 0;
});

afterEach(() => {
  base.defaultProps.weekStartsOn = 0;
});

describe('PreferencesProvider', () => {
  it('applies the week start before the first render and on every change', async () => {
    const { hook } = await setup();
    // 默认周一：Provider 初始化时已同步写入，而不是等 effect
    expect(base.defaultProps.weekStartsOn).toBe(1);
    act(() => hook.result.current.setPreferences({ weekStart: 'sunday' }));
    expect(base.defaultProps.weekStartsOn).toBe(0);
  });

  it('mirrors refetchOnFocus into the QueryClient default options', async () => {
    const { client, hook } = await setup();
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
    act(() => hook.result.current.setPreferences({ refetchOnFocus: true }));
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
    // 其余默认项（staleTime / retry）保持不变
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    act(() => hook.result.current.setPreferences({ refetchOnFocus: false }));
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
