import type { DataGridColumn, SelectionSnapshot } from './types';
import { columnKind, copyValue } from './grid-format';

type Row = Record<string, unknown>;

export interface SnapshotSerializeContext {
  snapshot: SelectionSnapshot;
  rows: Row[];
  /** 可见列（与快照 col 下标对应） */
  columns: DataGridColumn[];
}

/** 快照 → 值矩阵（string 化，NULL → ''） */
function toTextMatrix(ctx: SnapshotSerializeContext): string[][] {
  const kinds = ctx.columns.map((c) => columnKind(c.dataType));
  return ctx.snapshot.matrix.map((line) =>
    line.map((pos) => copyValue(ctx.rows[pos.row]?.[ctx.columns[pos.col]?.name ?? ''], kinds[pos.col])));
}

/** 快照涉及的列名（按矩阵首行的列顺序；rows/矩形模式即选区列） */
export function snapshotColumnNames(ctx: SnapshotSerializeContext): string[] {
  const first = ctx.snapshot.matrix[0];
  if (!first) return [];
  return first.map((pos) => ctx.columns[pos.col]?.name ?? '');
}

/** TSV（Excel 直贴），不含表头 */
export function snapshotToTsv(ctx: SnapshotSerializeContext): string {
  return toTextMatrix(ctx)
    .map((line) => line.map((v) => v.replaceAll('\t', ' ').replaceAll('\n', ' ')).join('\t'))
    .join('\n');
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replaceAll('"', '""') + '"';
  return v;
}

/** CSV，含表头 */
export function snapshotToCsv(ctx: SnapshotSerializeContext): string {
  const header = snapshotColumnNames(ctx).map(csvEscape).join(',');
  const body = toTextMatrix(ctx)
    .map((line) => line.map(csvEscape).join(','))
    .join('\n');
  return header + '\n' + body;
}

/** JSON：对象数组，保留原始值（NULL → null，对象原样） */
export function snapshotToJson(ctx: SnapshotSerializeContext): string {
  const objects = ctx.snapshot.matrix.map((line) => {
    const obj: Record<string, unknown> = {};
    for (const pos of line) {
      const name = ctx.columns[pos.col]?.name;
      if (!name) continue;
      const raw = ctx.rows[pos.row]?.[name];
      obj[name] = raw === undefined ? null : raw;
    }
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

function mdEscape(v: string): string {
  return v.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Markdown 表格，含表头 */
export function snapshotToMarkdown(ctx: SnapshotSerializeContext): string {
  const names = snapshotColumnNames(ctx);
  const header = `| ${names.map(mdEscape).join(' | ')} |`;
  const sep = `| ${names.map(() => '---').join(' | ')} |`;
  const body = toTextMatrix(ctx)
    .map((line) => `| ${line.map(mdEscape).join(' | ')} |`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

/** 单元格总数超过该值时应提示确认 */
export const COPY_CONFIRM_THRESHOLD = 50_000;

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
