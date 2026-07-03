import { describe, expect, it } from 'vitest';
import { sortRowsLocally } from './local-sort';
import type { DataGridColumn } from './types';

const numCol: DataGridColumn = { name: 'n', dataType: 'integer' };
const strCol: DataGridColumn = { name: 's', dataType: 'character varying' };
const dtCol: DataGridColumn = { name: 't', dataType: 'timestamp with time zone' };

describe('sortRowsLocally', () => {
  it('数字升序 / 降序', () => {
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortRowsLocally(rows, numCol, 'asc').map((r) => r.n)).toEqual([1, 2, 3]);
    expect(sortRowsLocally(rows, numCol, 'desc').map((r) => r.n)).toEqual([3, 2, 1]);
    // 原数组不变
    expect(rows.map((r) => r.n)).toEqual([3, 1, 2]);
  });

  it('NULL 恒排尾（升降序均如此）', () => {
    const rows = [{ n: null }, { n: 2 }, { n: 1 }];
    expect(sortRowsLocally(rows, numCol, 'asc').map((r) => r.n)).toEqual([1, 2, null]);
    expect(sortRowsLocally(rows, numCol, 'desc').map((r) => r.n)).toEqual([2, 1, null]);
  });

  it('字符串数字感知（numeric collation）', () => {
    const rows = [{ s: 'item10' }, { s: 'item2' }, { s: 'item1' }];
    expect(sortRowsLocally(rows, strCol, 'asc').map((r) => r.s)).toEqual(['item1', 'item2', 'item10']);
  });

  it('日期时间字典序即时间序', () => {
    const rows = [
      { t: '2026-06-06 18:00:30' },
      { t: '2026-06-06 17:35:12' },
      { t: '2026-06-07 01:00:00' },
    ];
    expect(sortRowsLocally(rows, dtCol, 'asc').map((r) => r.t)).toEqual([
      '2026-06-06 17:35:12', '2026-06-06 18:00:30', '2026-06-07 01:00:00',
    ]);
  });

  it('稳定排序：相等值保留原顺序', () => {
    const rows = [{ n: 1, tag: 'a' }, { n: 1, tag: 'b' }, { n: 0, tag: 'c' }];
    expect(sortRowsLocally(rows, numCol, 'asc').map((r) => r.tag)).toEqual(['c', 'a', 'b']);
  });

  it('无排序参数返回原引用', () => {
    const rows = [{ n: 1 }];
    expect(sortRowsLocally(rows, undefined, 'asc')).toBe(rows);
    expect(sortRowsLocally(rows, numCol, undefined)).toBe(rows);
  });
});
