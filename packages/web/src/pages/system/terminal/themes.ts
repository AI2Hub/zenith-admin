import type { ITheme } from '@xterm/xterm';
import type { editor } from 'monaco-editor';

/**
 * 终端 / 编辑器统一配色调色板。
 * 一套调色板同时驱动 xterm（{@link toXtermTheme}）与 Monaco（{@link toMonacoTheme}），
 * 保证终端与文件编辑器视觉一致。
 */
export interface TerminalThemeDef {
  id: string;
  name: string;
  type: 'dark' | 'light';
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export const DEFAULT_DARK_THEME_ID = 'catppuccin-mocha';
export const DEFAULT_LIGHT_THEME_ID = 'vscode-light';

export const DEFAULT_FONT_FAMILY =
  '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace';

/** 可选等宽字体预设 */
export const FONT_FAMILY_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Cascadia Code', value: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "Cascadia Code", Menlo, Monaco, monospace' },
  { label: 'Fira Code', value: '"Fira Code", "Cascadia Code", Menlo, Monaco, monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", Menlo, Monaco, monospace' },
  { label: 'Consolas', value: 'Consolas, "Courier New", monospace' },
  { label: 'Menlo / Monaco', value: 'Menlo, Monaco, "Courier New", monospace' },
  { label: '系统等宽', value: 'ui-monospace, SFMono-Regular, "Courier New", monospace' },
];

export const TERMINAL_THEMES: readonly TerminalThemeDef[] = [
  // ---------- 暗色 ----------
  {
    id: 'catppuccin-mocha', name: 'Catppuccin Mocha', type: 'dark',
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selection: '#585b70',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
    brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  {
    id: 'vscode-dark', name: 'VS Code Dark', type: 'dark',
    background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#aeafad', selection: '#264f78',
    black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
    blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
    brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff',
  },
  {
    id: 'dracula', name: 'Dracula', type: 'dark',
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selection: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  {
    id: 'one-dark', name: 'One Dark', type: 'dark',
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selection: '#3e4451',
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', type: 'dark',
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selection: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  {
    id: 'github-dark', name: 'GitHub Dark', type: 'dark',
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', selection: '#163356',
    black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
    brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
  },
  {
    id: 'nord', name: 'Nord', type: 'dark',
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selection: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  {
    id: 'monokai', name: 'Monokai', type: 'dark',
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', selection: '#49483e',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', type: 'dark',
    background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', selection: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
    brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  // ---------- 亮色 ----------
  {
    id: 'vscode-light', name: 'VS Code Light', type: 'light',
    background: '#ffffff', foreground: '#383a42', cursor: '#000000', selection: '#add6ff',
    black: '#000000', red: '#cd3131', green: '#00bc00', yellow: '#949800',
    blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
    brightBlack: '#686868', brightRed: '#cd3131', brightGreen: '#14ce14', brightYellow: '#b5ba00',
    brightBlue: '#0451a5', brightMagenta: '#bc05bc', brightCyan: '#0598bc', brightWhite: '#a5a5a5',
  },
  {
    id: 'catppuccin-latte', name: 'Catppuccin Latte', type: 'light',
    background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selection: '#acb0be',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
    brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
  },
  {
    id: 'one-light', name: 'One Light', type: 'light',
    background: '#fafafa', foreground: '#383a42', cursor: '#526fff', selection: '#e5e5e6',
    black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
    blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#fafafa',
    brightBlack: '#a0a1a7', brightRed: '#e45649', brightGreen: '#50a14f', brightYellow: '#c18401',
    brightBlue: '#4078f2', brightMagenta: '#a626a4', brightCyan: '#0184bc', brightWhite: '#ffffff',
  },
  {
    id: 'solarized-light', name: 'Solarized Light', type: 'light',
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', selection: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  {
    id: 'github-light', name: 'GitHub Light', type: 'light',
    background: '#ffffff', foreground: '#24292f', cursor: '#24292f', selection: '#add6ff',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
    blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
  },
  {
    id: 'gruvbox-light', name: 'Gruvbox Light', type: 'light',
    background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', selection: '#d5c4a1',
    black: '#fbf1c7', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#7c6f64',
    brightBlack: '#928374', brightRed: '#9d0006', brightGreen: '#79740e', brightYellow: '#b57614',
    brightBlue: '#076678', brightMagenta: '#8f3f71', brightCyan: '#427b58', brightWhite: '#3c3836',
  },
];

export const DARK_THEMES = TERMINAL_THEMES.filter((t) => t.type === 'dark');
export const LIGHT_THEMES = TERMINAL_THEMES.filter((t) => t.type === 'light');

export function getThemeById(id: string | undefined): TerminalThemeDef | undefined {
  return TERMINAL_THEMES.find((t) => t.id === id);
}

/** 按 id 解析主题，找不到时回退到对应明暗模式的默认主题。 */
export function resolveTheme(id: string | undefined, type: 'dark' | 'light'): TerminalThemeDef {
  return (
    getThemeById(id) ??
    getThemeById(type === 'dark' ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID) ??
    TERMINAL_THEMES[0]
  );
}

/** 调色板 → xterm ITheme */
export function toXtermTheme(t: TerminalThemeDef): ITheme {
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.background,
    selectionBackground: t.selection,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

const strip = (hex: string): string => hex.replace('#', '');

/** Monaco 注册主题时使用的唯一名称 */
export function monacoThemeName(t: TerminalThemeDef): string {
  return `zenith-term-${t.id}`;
}

/**
 * 调色板 → Monaco 主题数据。
 * 背景/前景/光标/选区与终端完全一致，语法高亮 token 用调色板做近似映射。
 */
export function toMonacoTheme(t: TerminalThemeDef): editor.IStandaloneThemeData {
  const base: editor.BuiltinTheme = t.type === 'dark' ? 'vs-dark' : 'vs';
  return {
    base,
    inherit: true,
    rules: [
      { token: '', foreground: strip(t.foreground), background: strip(t.background) },
      { token: 'comment', foreground: strip(t.brightBlack), fontStyle: 'italic' },
      { token: 'keyword', foreground: strip(t.magenta) },
      { token: 'string', foreground: strip(t.green) },
      { token: 'number', foreground: strip(t.yellow) },
      { token: 'regexp', foreground: strip(t.cyan) },
      { token: 'type', foreground: strip(t.cyan) },
      { token: 'type.identifier', foreground: strip(t.cyan) },
      { token: 'function', foreground: strip(t.blue) },
      { token: 'variable', foreground: strip(t.foreground) },
      { token: 'variable.predefined', foreground: strip(t.red) },
      { token: 'constant', foreground: strip(t.yellow) },
      { token: 'operator', foreground: strip(t.cyan) },
      { token: 'delimiter', foreground: strip(t.foreground) },
      { token: 'tag', foreground: strip(t.red) },
      { token: 'attribute.name', foreground: strip(t.yellow) },
      { token: 'attribute.value', foreground: strip(t.green) },
      { token: 'key', foreground: strip(t.blue) },
    ],
    colors: {
      'editor.background': t.background,
      'editor.foreground': t.foreground,
      'editorCursor.foreground': t.cursor,
      'editor.selectionBackground': t.selection,
      'editor.selectionHighlightBackground': t.selection,
      'editorLineNumber.foreground': t.brightBlack,
      'editorLineNumber.activeForeground': t.foreground,
      'editorIndentGuide.background': t.brightBlack,
      'editorWhitespace.foreground': t.brightBlack,
      'editorWidget.background': t.background,
      'editorWidget.foreground': t.foreground,
      'editorSuggestWidget.background': t.background,
      'input.background': t.background,
      'dropdown.background': t.background,
    },
  };
}
