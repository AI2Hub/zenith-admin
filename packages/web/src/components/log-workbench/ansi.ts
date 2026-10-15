/**
 * ANSI SGR 转义序列解析：主机日志（nginx / systemd / 容器输出）可能带终端颜色，
 * 搜索与级别识别在去色文本上进行，渲染时再按片段着色。
 * 只解析 16 色（含亮色）；256 色与 truecolor（`38;5;n` / `38;2;r;g;b`）不识别，按默认色渲染。
 */

// eslint-disable-next-line no-control-regex
const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;

// 只给出变量名：色值随明暗切换，由查看器的 --logansi-* 提供（见 LogContentView.css）。
const refs = (prefix: string) => Array.from({ length: 8 }, (_, index) => `var(--logansi-${prefix}-${index})`);
const ANSI_FG = refs('fg');
const ANSI_FG_BRIGHT = refs('bright');
const ANSI_BG = refs('bg');
const ANSI_BG_BRIGHT = refs('bg-bright');

export interface AnsiSpan {
  text: string;
  color?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
}

export function hasAnsi(text: string): boolean {
  return text.includes('\x1b[');
}

/** 去除所有 SGR 转义序列（用于关键词匹配、级别识别、复制与导出） */
export function stripAnsi(text: string): string {
  return hasAnsi(text) ? text.replaceAll(ANSI_SGR_RE, '') : text;
}

/** 按 SGR 码把一行拆成带样式的片段；片段文本拼接即去色文本 */
export function parseAnsi(raw: string): AnsiSpan[] {
  const result: AnsiSpan[] = [];
  let color: string | undefined;
  let bg: string | undefined;
  let bold = false;
  let italic = false;
  let dim = false;
  // eslint-disable-next-line no-control-regex
  const segments = raw.split(/(\x1b\[[0-9;]*m)/);
  for (const seg of segments) {
    if (seg.startsWith('\x1b[') && seg.endsWith('m')) {
      const codes = seg.slice(2, -1).split(';').map(Number);
      for (const code of codes) {
        if (code === 0) { color = undefined; bg = undefined; bold = false; italic = false; dim = false; }
        else if (code === 1) bold = true;
        else if (code === 2) dim = true;
        else if (code === 3) italic = true;
        else if (code === 22) { bold = false; dim = false; }
        else if (code === 23) italic = false;
        else if (code === 39) color = undefined;
        else if (code === 49) bg = undefined;
        else if (code >= 30 && code <= 37) color = ANSI_FG[code - 30];
        else if (code >= 90 && code <= 97) color = ANSI_FG_BRIGHT[code - 90];
        else if (code >= 40 && code <= 47) bg = ANSI_BG[code - 40];
        else if (code >= 100 && code <= 107) bg = ANSI_BG_BRIGHT[code - 100];
      }
    } else if (seg) {
      result.push({ text: seg, color, bg, bold: bold || undefined, italic: italic || undefined, dim: dim || undefined });
    }
  }
  return result;
}
