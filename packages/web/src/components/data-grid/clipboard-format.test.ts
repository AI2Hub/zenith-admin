import { describe, expect, it } from 'vitest';
import {
  snapshotColumnNames,
  snapshotToCsv,
  snapshotToJson,
  snapshotToMarkdown,
  snapshotToTsv,
  type SnapshotSerializeContext,
} from './clipboard-format';
import type { DataGridColumn, SelectionSnapshot } from './types';

const columns: DataGridColumn[] = [
  { name: 'id', dataType: 'integer' },
  { name: 'name', dataType: 'character varying' },
  { name: 'meta', dataType: 'jsonb' },
];

const rows: Array<Record<string, unknown>> = [
  { id: 1, name: 'Alice', meta: { role: 'admin' } },
  { id: 2, name: null, meta: null },
  { id: 3, name: 'C,"x"', meta: { tag: 'a|b' } },
];

function rectSnapshot(r1: number, r2: number, c1: number, c2: number): SelectionSnapshot {
  const rowIndexes: number[] = [];
  const matrix: SelectionSnapshot['matrix'] = [];
  for (let r = r1; r <= r2; r++) {
    rowIndexes.push(r);
    const line = [];
    for (let c = c1; c <= c2; c++) line.push({ row: r, col: c });
    matrix.push(line);
  }
  return { mode: 'cells', rowIndexes, matrix, cellCount: rowIndexes.length * (c2 - c1 + 1) };
}

function ctx(snapshot: SelectionSnapshot): SnapshotSerializeContext {
  return { snapshot, rows, columns };
}

describe('snapshotToTsv', () => {
  it('TSV：NULL → 空串，对象 → JSON', () => {
    const tsv = snapshotToTsv(ctx(rectSnapshot(0, 1, 0, 2)));
    expect(tsv).toBe('1\tAlice\t{"role":"admin"}\n2\t\t');
  });

  it('TSV 值内的制表符与换行被替换为空格', () => {
    const dirty: Array<Record<string, unknown>> = [{ id: 'a\tb\nc' }];
    const snap = rectSnapshot(0, 0, 0, 0);
    const tsv = snapshotToTsv({ snapshot: snap, rows: dirty, columns: [{ name: 'id' }] });
    expect(tsv).toBe('a b c');
  });
});

describe('snapshotToCsv', () => {
  it('CSV：含表头，逗号引号转义', () => {
    const csv = snapshotToCsv(ctx(rectSnapshot(2, 2, 0, 1)));
    expect(csv).toBe('id,name\n3,"C,""x"""');
  });
});

describe('snapshotToJson', () => {
  it('JSON：保留原始类型（null / 对象）', () => {
    const json = snapshotToJson(ctx(rectSnapshot(0, 1, 0, 2)));
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(parsed).toEqual([
      { id: 1, name: 'Alice', meta: { role: 'admin' } },
      { id: 2, name: null, meta: null },
    ]);
  });
});

describe('snapshotToMarkdown', () => {
  it('Markdown：表头 + 分隔行 + 管道符转义', () => {
    const md = snapshotToMarkdown(ctx(rectSnapshot(2, 2, 1, 2)));
    const lines = md.split('\n');
    expect(lines[0]).toBe('| name | meta |');
    expect(lines[1]).toBe('| --- | --- |');
    expect(lines[2]).toContain('a\\|b');
  });
});

describe('snapshotColumnNames', () => {
  it('返回快照首行的列名', () => {
    expect(snapshotColumnNames(ctx(rectSnapshot(0, 0, 1, 2)))).toEqual(['name', 'meta']);
  });
  it('空快照返回空数组', () => {
    expect(snapshotColumnNames(ctx({ mode: 'none', rowIndexes: [], matrix: [], cellCount: 0 }))).toEqual([]);
  });
});
