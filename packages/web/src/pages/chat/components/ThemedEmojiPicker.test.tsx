import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeControllerContext, type ThemeControllerValue } from '@/providers/theme-controller';
import { ThemedEmojiPicker } from './ThemedEmojiPicker';

vi.mock('@emoji-mart/data', () => ({ default: {} }));
vi.mock('@emoji-mart/react', () => ({
  default: ({ theme }: { theme: string }) => (
    <div data-testid="emoji-picker" data-theme={theme} />
  ),
}));

function createThemeValue(isDark: boolean): ThemeControllerValue {
  return {
    mode: isDark ? 'dark' : 'light',
    themeColor: 'wechat',
    isDark,
    setThemeMode: vi.fn(),
    setThemeColor: vi.fn(),
    cycleTheme: vi.fn(),
    resetTheme: vi.fn(),
  };
}

describe('ThemedEmojiPicker', () => {
  it('follows the resolved application theme', () => {
    const picker = <ThemedEmojiPicker onEmojiSelect={vi.fn()} />;
    const { rerender } = render(
      <ThemeControllerContext.Provider value={createThemeValue(false)}>
        {picker}
      </ThemeControllerContext.Provider>,
    );

    expect(screen.getByTestId('emoji-picker')).toHaveAttribute('data-theme', 'light');

    rerender(
      <ThemeControllerContext.Provider value={createThemeValue(true)}>
        {picker}
      </ThemeControllerContext.Provider>,
    );

    expect(screen.getByTestId('emoji-picker')).toHaveAttribute('data-theme', 'dark');
  });
});
