import type { CellKind } from './grid-format';
import { columnKind } from './grid-format';
import type { DataGridColumn, SortDir } from './types';

type Row = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined;
}

/** 类型感知的值比较（借鉴 dbx compareDataGridValues） */
function compareValues(a: unknown, b: unknown, kind: CellKind): number {
  if (kind === 'int' || kind === 'number') {
    const na = typeof a === 'number' ? a : Number(a);
    const nb = typeof b === 'number' ? b : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    }
  }
  if (kind === 'bool') {
    const ba = a === true || a === 'true' || a === 1;
    const bb = b === true || b === 'true' || b === 1;
    if (ba === bb) return 0;
    return ba ? 1 : -1;
  }
  if (kind === 'datetime' || kind === 'date' || kind === 'time') {
    const sa = String(a);
    const sb = String(b);
    // ISO / YYYY-MM-DD HH:mm:ss 格式字典序即时间序
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }
  const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return sa.localeCompare(sb, 'zh-Hans-CN', { numeric: true });
}

/**
 * 当前页本地排序（借鉴 dbx sortDataGridRows 三阶段）：
 * 1. NULL 恒排尾（与方向无关）；2. 类型感知比较；3. 稳定排序（相等保留原顺序）。
 * 返回排序后的新数组（输入不变）；无需排序时返回原引用。
 */
export function sortRowsLocally(
  rows: Row[],
  column: DataGridColumn | undefined,
  dir: SortDir | undefined,
): Row[] {
  if (!column || !dir || rows.length <= 1) return rows;
  const kind = columnKind(column.dataType);
  const name = column.name;
  const mul = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const a = left.row[name];
      const b = right.row[name];
      const ea = isEmpty(a);
      const eb = isEmpty(b);
      if (ea || eb) {
        if (ea && eb) return left.index - right.index;
        return ea ? 1 : -1; // NULL 恒排尾
      }
      const cmp = compareValues(a, b, kind);
      if (cmp !== 0) return cmp * mul;
      return left.index - right.index; // 稳定
    })
    .map((item) => item.row);
}
