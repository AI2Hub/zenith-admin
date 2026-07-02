import { describe, expect, it } from 'vitest';
import type { CellPos, SelectionState } from './types';
import {
  EMPTY_SELECTION,
  buildSelectionSnapshot,
  isCellSelected,
  rowSelectionSignature,
  selectionReducer,
} from './useGridSelection';

function fresh(): SelectionState {
  return { ...EMPTY_SELECTION, discrete: new Set(), rows: new Set() };
}

const pos = (row: number, col: number): CellPos => ({ row, col });

describe('selectionReducer', () => {
  it('单击选中单格并设为 anchor/focus', () => {
    const s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(2, 3), shift: false, ctrl: false });
    expect(s.anchor).toEqual(pos(2, 3));
    expect(s.focus).toEqual(pos(2, 3));
    expect(isCellSelected(s, 2, 3)).toBe(true);
    expect(isCellSelected(s, 2, 4)).toBe(false);
  });

  it('Shift+单击扩展区域选择', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(1, 1), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(3, 2), shift: true, ctrl: false });
    expect(s.anchor).toEqual(pos(1, 1));
    expect(s.focus).toEqual(pos(3, 2));
    expect(isCellSelected(s, 2, 1)).toBe(true);
    expect(isCellSelected(s, 2, 2)).toBe(true);
    expect(isCellSelected(s, 0, 1)).toBe(false);
    expect(isCellSelected(s, 2, 3)).toBe(false);
  });

  it('Ctrl+单击离散选择并可 toggle', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(0, 0), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(2, 2), shift: false, ctrl: true });
    // 原区域 (0,0) 并入离散集
    expect(isCellSelected(s, 0, 0)).toBe(true);
    expect(isCellSelected(s, 2, 2)).toBe(true);
    // 再次 Ctrl+单击取消
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(2, 2), shift: false, ctrl: true });
    expect(isCellSelected(s, 2, 2)).toBe(false);
    expect(isCellSelected(s, 0, 0)).toBe(true);
  });

  it('拖拽更新 focus', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(1, 1), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'cellDragOver', pos: pos(4, 0) });
    expect(s.focus).toEqual(pos(4, 0));
    expect(isCellSelected(s, 3, 0)).toBe(true);
    expect(isCellSelected(s, 3, 1)).toBe(true);
  });

  it('行号点击选择整行；Shift 选区间；Ctrl 增量 toggle', () => {
    let s = selectionReducer(fresh(), { type: 'rowClick', row: 2, shift: false, ctrl: false });
    expect(s.rows.has(2)).toBe(true);
    s = selectionReducer(s, { type: 'rowClick', row: 5, shift: true, ctrl: false });
    expect(Array.from(s.rows).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    // Ctrl+点击：在既有选择上增量添加
    s = selectionReducer(s, { type: 'rowClick', row: 8, shift: false, ctrl: true });
    expect(s.rows.has(8)).toBe(true);
    expect(s.rows.has(3)).toBe(true);
    s = selectionReducer(s, { type: 'rowClick', row: 8, shift: false, ctrl: true });
    expect(s.rows.has(8)).toBe(false);
  });

  it('同一行再次点击取消选择', () => {
    let s = selectionReducer(fresh(), { type: 'rowClick', row: 1, shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'rowClick', row: 1, shift: false, ctrl: false });
    expect(s.rows.size).toBe(0);
  });

  it('行选择与单元格选择互斥', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(1, 1), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'rowClick', row: 0, shift: false, ctrl: false });
    expect(s.anchor).toBeNull();
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(1, 1), shift: false, ctrl: false });
    expect(s.rows.size).toBe(0);
  });

  it('move 越界钳制', () => {
    let s = selectionReducer(fresh(), { type: 'moveTo', pos: pos(0, 0), shift: false });
    s = selectionReducer(s, { type: 'move', dRow: -5, dCol: -5, shift: false, rowCount: 10, colCount: 4 });
    expect(s.anchor).toEqual(pos(0, 0));
    s = selectionReducer(s, { type: 'move', dRow: 100, dCol: 100, shift: false, rowCount: 10, colCount: 4 });
    expect(s.anchor).toEqual(pos(9, 3));
  });

  it('Shift+move 保留 anchor 只动 focus', () => {
    let s = selectionReducer(fresh(), { type: 'moveTo', pos: pos(2, 2), shift: false });
    s = selectionReducer(s, { type: 'move', dRow: 2, dCol: 0, shift: true, rowCount: 10, colCount: 4 });
    expect(s.anchor).toEqual(pos(2, 2));
    expect(s.focus).toEqual(pos(4, 2));
  });

  it('selectAll 选中全部行', () => {
    const s = selectionReducer(fresh(), { type: 'selectAll', rowCount: 3 });
    expect(s.rows.size).toBe(3);
  });

  it('ensureCellSelected：选区外改选单格，选区内保持', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(0, 0), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'cellDragOver', pos: pos(2, 2) });
    const kept = selectionReducer(s, { type: 'ensureCellSelected', pos: pos(1, 1) });
    expect(kept).toBe(s);
    const changed = selectionReducer(s, { type: 'ensureCellSelected', pos: pos(5, 0) });
    expect(changed.anchor).toEqual(pos(5, 0));
    expect(changed.focus).toEqual(pos(5, 0));
  });

  it('clear 清空所有选择', () => {
    let s = selectionReducer(fresh(), { type: 'selectAll', rowCount: 5 });
    s = selectionReducer(s, { type: 'clear' });
    expect(s.rows.size).toBe(0);
    expect(s.anchor).toBeNull();
  });
});

describe('buildSelectionSnapshot', () => {
  it('rows 模式导出整行所有列', () => {
    let s = selectionReducer(fresh(), { type: 'rowClick', row: 3, shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'rowClick', row: 1, shift: false, ctrl: true });
    const snap = buildSelectionSnapshot(s, 3);
    expect(snap.mode).toBe('rows');
    expect(snap.rowIndexes).toEqual([1, 3]);
    expect(snap.matrix[0]).toEqual([pos(1, 0), pos(1, 1), pos(1, 2)]);
    expect(snap.cellCount).toBe(6);
  });

  it('矩形区域导出有序矩阵', () => {
    let s = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(2, 2), shift: false, ctrl: false });
    s = selectionReducer(s, { type: 'cellDragOver', pos: pos(0, 1) });
    const snap = buildSelectionSnapshot(s, 5);
    expect(snap.mode).toBe('cells');
    expect(snap.rowIndexes).toEqual([0, 1, 2]);
    expect(snap.matrix[0]).toEqual([pos(0, 1), pos(0, 2)]);
    expect(snap.cellCount).toBe(6);
  });

  it('离散模式按行列排序', () => {
    let s = fresh();
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(4, 2), shift: false, ctrl: true });
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(1, 3), shift: false, ctrl: true });
    s = selectionReducer(s, { type: 'cellMouseDown', pos: pos(1, 0), shift: false, ctrl: true });
    const snap = buildSelectionSnapshot(s, 5);
    expect(snap.rowIndexes).toEqual([1, 4]);
    expect(snap.matrix[0]).toEqual([pos(1, 0), pos(1, 3)]);
    expect(snap.matrix[1]).toEqual([pos(4, 2)]);
  });

  it('空选区返回 none', () => {
    const snap = buildSelectionSnapshot(fresh(), 3);
    expect(snap.mode).toBe('none');
    expect(snap.cellCount).toBe(0);
  });
});

describe('rowSelectionSignature', () => {
  it('选中外观变化时签名变化，否则稳定', () => {
    const s1 = selectionReducer(fresh(), { type: 'cellMouseDown', pos: pos(1, 1), shift: false, ctrl: false });
    const s2 = selectionReducer(s1, { type: 'cellDragOver', pos: pos(1, 2) });
    expect(rowSelectionSignature(s1, 1, 4)).not.toBe(rowSelectionSignature(s2, 1, 4));
    // 未涉及的行签名保持一致
    expect(rowSelectionSignature(s1, 3, 4)).toBe(rowSelectionSignature(s2, 3, 4));
  });
});
