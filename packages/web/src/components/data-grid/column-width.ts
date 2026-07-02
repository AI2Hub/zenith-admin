import type { DataGridColumn } from './types';
import { columnKind, displayValue } from './grid-format';

export const COL_MIN_WIDTH = 72;
export const COL_MAX_WIDTH = 400;
export const ROW_NUMBER_WIDTH = 48;

const CHAR_WIDTH = 7.5;
const WIDE_CHAR_WIDTH = 14;
const CELL_PADDING = 25;
/** 表头附加空间：类型徽标 / 排序箭头 / 漏斗按钮 */
const HEADER_EXTRA = 74;
const SAMPLE_ROWS = 50;
const VALUE_TEXT_LIMIT = 64;

/** 估算文本渲染宽度（区分全角字符） */
export function estimateTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    // eslint-disable-next-line no-control-regex
    w += /[^\u0000-\u00ff]/.test(ch) ? WIDE_CHAR_WIDTH : CHAR_WIDTH;
  }
  return Math.round(w);
}

/**
 * 采样估算单列宽度（借鉴 dbx dataGridColumnWidth：采样前 N 行取最长内容）。
 */
export function estimateColumnWidth(
  column: DataGridColumn,
  rows: Array<Record<string, unknown>>,
): number {
  const kind = columnKind(column.dataType);
  let max = estimateTextWidth(column.name) + HEADER_EXTRA;
  for (const row of rows.slice(0, SAMPLE_ROWS)) {
    const text = displayValue(row[column.name], kind);
    if (!text) continue;
    const clipped = text.length > VALUE_TEXT_LIMIT ? text.slice(0, VALUE_TEXT_LIMIT) : text;
    const w = estimateTextWidth(clipped) + CELL_PADDING;
    if (w > max) max = w;
  }
  return Math.max(COL_MIN_WIDTH, Math.min(COL_MAX_WIDTH, max));
}

/** 批量估算所有列宽 */
export function estimateColumnWidths(
  columns: DataGridColumn[],
  rows: Array<Record<string, unknown>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of columns) out[col.name] = estimateColumnWidth(col, rows);
  return out;
}
