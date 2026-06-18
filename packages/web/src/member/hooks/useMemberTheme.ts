import { useState, useCallback } from 'react';

const THEME_COLOR_KEY = 'zenith_member_theme_color';
export const DEFAULT_THEME_COLOR = '#07c160';

export interface ThemePreset {
  name: string;
  color: string;
  label: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: 'green', color: '#07c160', label: '微信绿' },
  { name: 'blue', color: '#1677ff', label: '天空蓝' },
  { name: 'purple', color: '#722ed1', label: '优雅紫' },
  { name: 'orange', color: '#fa8c16', label: '活力橙' },
  { name: 'red', color: '#f5222d', label: '中国红' },
  { name: 'teal', color: '#13c2c2', label: '青碧色' },
  { name: 'pink', color: '#eb2f96', label: '粉玫瑰' },
];

/** 在 React 渲染前调用一次，避免主题闪烁 */
export function initMemberTheme() {
  const color = localStorage.getItem(THEME_COLOR_KEY) ?? DEFAULT_THEME_COLOR;
  document.documentElement.style.setProperty('--m-primary', color);
}

export function useMemberTheme() {
  const [themeColor, setThemeColorState] = useState<string>(
    () => localStorage.getItem(THEME_COLOR_KEY) ?? DEFAULT_THEME_COLOR,
  );

  const setThemeColor = useCallback((color: string) => {
    localStorage.setItem(THEME_COLOR_KEY, color);
    document.documentElement.style.setProperty('--m-primary', color);
    setThemeColorState(color);
  }, []);

  return { themeColor, setThemeColor, presets: THEME_PRESETS };
}
