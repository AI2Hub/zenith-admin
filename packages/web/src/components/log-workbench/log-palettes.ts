import type { CSSProperties } from 'react';
import { useState } from 'react';

interface LogPaletteColors {
  background: string;
  plain: string;
  key: string;
  string: string;
  number: string;
  literal: string;
  muted: string;
}

interface LogPalette {
  id: string;
  name: string;
  light: LogPaletteColors;
  dark: LogPaletteColors;
}

/** 日志专用语法色；每组同时提供浅 / 深色，独立于管理后台的主题色。 */
export const LOG_PALETTES = [
  {
    id: 'github', name: 'GitHub',
    light: { background: '#f6f8fa', plain: '#24292f', key: '#0550ae', string: '#116329', number: '#0550ae', literal: '#6639ba', muted: '#57606a' },
    dark: { background: '#0d1117', plain: '#c9d1d9', key: '#79c0ff', string: '#7ee787', number: '#79c0ff', literal: '#d2a8ff', muted: '#8b949e' },
  },
  {
    id: 'one', name: 'One',
    light: { background: '#fafafa', plain: '#383a42', key: '#a626a4', string: '#397300', number: '#986801', literal: '#a626a4', muted: '#676b73' },
    dark: { background: '#282c34', plain: '#abb2bf', key: '#61afef', string: '#98c379', number: '#e5c07b', literal: '#c678dd', muted: '#abb2bf' },
  },
  {
    id: 'nord', name: 'Nord',
    light: { background: '#eceff4', plain: '#2e3440', key: '#375879', string: '#3b6350', number: '#8b462f', literal: '#794d79', muted: '#596579' },
    dark: { background: '#2e3440', plain: '#d8dee9', key: '#88c0d0', string: '#a3be8c', number: '#ebcb8b', literal: '#c7a3c0', muted: '#a5b0c2' },
  },
  {
    id: 'solarized', name: 'Solarized',
    light: { background: '#fdf6e3', plain: '#455b62', key: '#126e9d', string: '#526600', number: '#936800', literal: '#9d3b72', muted: '#586e75' },
    dark: { background: '#002b36', plain: '#a4b5b6', key: '#5eb3e4', string: '#b1bd45', number: '#dfad45', literal: '#e990ba', muted: '#93a1a1' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox',
    light: { background: '#fbf1c7', plain: '#3c3836', key: '#076678', string: '#586000', number: '#8f3f71', literal: '#9d0006', muted: '#665c54' },
    dark: { background: '#282828', plain: '#ebdbb2', key: '#83a598', string: '#b8bb26', number: '#fabd2f', literal: '#d3869b', muted: '#bdae93' },
  },
  {
    id: 'catppuccin', name: 'Catppuccin',
    light: { background: '#eff1f5', plain: '#4c4f69', key: '#185fdf', string: '#267e17', number: '#a35300', literal: '#8839ef', muted: '#626580' },
    dark: { background: '#1e1e2e', plain: '#cdd6f4', key: '#89b4fa', string: '#a6e3a1', number: '#fab387', literal: '#cba6f7', muted: '#a6adc8' },
  },
  {
    id: 'dracula', name: 'Dracula',
    light: { background: '#f8f8f2', plain: '#282a36', key: '#6e3fa3', string: '#226d37', number: '#945116', literal: '#a32866', muted: '#626b86' },
    dark: { background: '#282a36', plain: '#f8f8f2', key: '#8be9fd', string: '#50fa7b', number: '#ffb86c', literal: '#bd93f9', muted: '#a3acd0' },
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night',
    light: { background: '#e1e2e7', plain: '#343b58', key: '#34548a', string: '#33635c', number: '#7d431d', literal: '#5a4a78', muted: '#565a6e' },
    dark: { background: '#1a1b26', plain: '#c0caf5', key: '#7aa2f7', string: '#9ece6a', number: '#ff9e64', literal: '#bb9af7', muted: '#969fca' },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine',
    light: { background: '#faf4ed', plain: '#575279', key: '#286983', string: '#386b68', number: '#985514', literal: '#755888', muted: '#716b8a' },
    dark: { background: '#191724', plain: '#e0def4', key: '#9ccfd8', string: '#ebbcba', number: '#f6c177', literal: '#c4a7e7', muted: '#a5a0bc' },
  },
  {
    id: 'everforest', name: 'Everforest',
    light: { background: '#fdf6e3', plain: '#4f585e', key: '#326f70', string: '#526b2e', number: '#926322', literal: '#875782', muted: '#626e63' },
    dark: { background: '#2d353b', plain: '#d3c6aa', key: '#7fbbb3', string: '#a7c080', number: '#dbbc7f', literal: '#d699b6', muted: '#a7b3a8' },
  },
  {
    id: 'monokai', name: 'Monokai',
    light: { background: '#faf9f5', plain: '#3e3d32', key: '#086e83', string: '#4d6f16', number: '#714ca6', literal: '#ad1752', muted: '#716d5b' },
    dark: { background: '#272822', plain: '#f8f8f2', key: '#66d9ef', string: '#a6e22e', number: '#ae81ff', literal: '#ff6e9e', muted: '#a8a48b' },
  },
  {
    id: 'flexoki', name: 'Flexoki',
    light: { background: '#fffcf0', plain: '#403e3c', key: '#205ea6', string: '#526000', number: '#ad4b0b', literal: '#5e409d', muted: '#6f6e69' },
    dark: { background: '#100f0f', plain: '#cecdc3', key: '#6eace0', string: '#a0af54', number: '#da9c3f', literal: '#b2a2e8', muted: '#a8a69d' },
  },
] as const satisfies readonly LogPalette[];

export type LogPaletteId = typeof LOG_PALETTES[number]['id'];
export const DEFAULT_LOG_PALETTE: LogPaletteId = 'github';

/** 日志配色偏好的 localStorage 键（与 LogWorkbench 内 usePersistentState('palette') 同一份，只读共用）。 */
export const LOG_PALETTE_STORAGE_KEY = 'logWorkbench.palette';

/** 读取用户在日志文件页选择的配色（日志文件页之外只读复用，不提供切换入口）。 */
export function useLogPalette(): LogPaletteId {
  const [palette] = useState<LogPaletteId>(() => {
    try {
      return resolveLogPalette(JSON.parse(localStorage.getItem(LOG_PALETTE_STORAGE_KEY) ?? 'null')).id;
    } catch {
      return DEFAULT_LOG_PALETTE;
    }
  });
  return palette;
}

export function resolveLogPalette(value: unknown): typeof LOG_PALETTES[number] {
  return LOG_PALETTES.find((palette) => palette.id === value) ?? LOG_PALETTES[0];
}

type PaletteStyle = CSSProperties & Record<`--log-${string}`, string>;

// 同时挂两档变量，由 CSS 响应全局和分区明暗模式，无需订阅 DOM 或重算日志。
export const LOG_PALETTE_STYLES = new Map<LogPaletteId, PaletteStyle>(LOG_PALETTES.map((palette) => [palette.id,
  Object.fromEntries((['light', 'dark'] as const).flatMap((mode) =>
    Object.entries(palette[mode]).map(([key, color]) => [`--log-${mode}-${key}`, color]),
  )),
]));
