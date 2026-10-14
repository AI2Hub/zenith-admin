import type { CSSProperties } from 'react';

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
] as const satisfies readonly LogPalette[];

export type LogPaletteId = typeof LOG_PALETTES[number]['id'];
export const DEFAULT_LOG_PALETTE: LogPaletteId = 'github';

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
