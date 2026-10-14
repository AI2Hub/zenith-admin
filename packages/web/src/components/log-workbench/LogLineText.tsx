import { memo, type CSSProperties, type ReactNode } from 'react';
import type { MatchRange } from './log-search';
import { tokenizeLogLine } from './log-highlight';
import { hasAnsi, parseAnsi, type AnsiSpan } from './ansi';

/**
 * 渲染一段文本并标出落在其中的匹配区间。`base` 是该段在整行（去色文本）中的起始偏移，
 * 匹配区间以整行偏移表示，跨片段的匹配会在两段各标一半。
 */
function renderHighlightedSegment(text: string, ranges: MatchRange[] | undefined, activeStart: number | null, base = 0): ReactNode {
  if (!ranges || ranges.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ranges[mid].end <= base) lo = mid + 1;
    else hi = mid;
  }
  for (let index = lo; index < ranges.length; index++) {
    const range = ranges[index];
    if (range.start >= base + text.length) break;
    const start = Math.max(range.start - base, 0);
    const end = Math.min(range.end - base, text.length);
    if (start >= end) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={`${index}-${range.start}`} className="log-content-mark" data-active={range.start === activeStart}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function ansiSpanStyle(span: AnsiSpan): CSSProperties | undefined {
  if (!span.color && !span.bg && !span.bold && !span.italic && !span.dim) return undefined;
  return {
    color: span.color,
    backgroundColor: span.bg,
    fontWeight: span.bold ? 'bold' : undefined,
    fontStyle: span.italic ? 'italic' : undefined,
    opacity: span.dim ? 0.6 : undefined,
  };
}

/** 渲染整行：带 ANSI 颜色的行按片段着色，匹配高亮映射到去色文本的偏移上 */
export const LogLineText = memo(function LogLineText({ raw, ranges, activeStart }: { raw: string; ranges?: MatchRange[]; activeStart: number | null }) {
  if (!hasAnsi(raw)) {
    // 无 ANSI 的行（NDJSON / pretty 文本）先做语法切分，token 拼接恒等于原行，
    // 搜索区间按同一偏移系映射；超长行 tokenize 返回 null，退回纯文本。
    const tokens = tokenizeLogLine(raw);
    if (tokens) {
      let offset = 0;
      return tokens.map((token, index) => {
        const base = offset;
        offset += token.text.length;
        return (
          <span key={index} className={`log-token-${token.kind}`}>
            {renderHighlightedSegment(token.text, ranges, activeStart, base)}
          </span>
        );
      });
    }
    return renderHighlightedSegment(raw, ranges, activeStart);
  }
  let offset = 0;
  return parseAnsi(raw).map((span, index) => {
    const base = offset;
    offset += span.text.length;
    return (
      <span key={index} style={ansiSpanStyle(span)}>
        {renderHighlightedSegment(span.text, ranges, activeStart, base)}
      </span>
    );
  });
});
