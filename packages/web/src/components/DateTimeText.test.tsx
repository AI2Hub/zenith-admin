import { createPreferencesContext } from '@/test-utils/preferences';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferencesContext } from '@/hooks/usePreferences';
import DateTimeText from './DateTimeText';

function withPrefs(timeDisplay: 'absolute' | 'relative') {
  const value = createPreferencesContext({ timeDisplay });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
  };
}

const NOW = new Date(2026, 8, 14, 10, 0, 0);
const THREE_MIN_AGO = new Date(NOW.getTime() - 3 * 60_000);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DateTimeText', () => {
  it('refreshes relative text as time passes', () => {
    render(<DateTimeText value={THREE_MIN_AGO} />, { wrapper: withPrefs('relative') });
    expect(screen.getByText('3 分钟前')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(screen.getByText('5 分钟前')).toBeTruthy();
  });
});
