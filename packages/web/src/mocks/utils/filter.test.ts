import { describe, expect, it } from 'vitest';
import { filterByKeyword, includesKeyword, matchesFilter, withinDateRange } from './filter';

describe('matchesFilter', () => {
  it('未传（undefined / null / 空串）不过滤，否则严格相等', () => {
    expect(matchesFilter('enabled', undefined)).toBe(true);
    expect(matchesFilter('enabled', null)).toBe(true);
    expect(matchesFilter('enabled', '')).toBe(true);
    expect(matchesFilter('enabled', 'enabled')).toBe(true);
    expect(matchesFilter('enabled', 'disabled')).toBe(false);
  });

  it('false / 0 是有效筛选值（与 queryBool / compactParams 语义一致）', () => {
    expect(matchesFilter(true, false)).toBe(false);
    expect(matchesFilter(false, false)).toBe(true);
    expect(matchesFilter(3, 0)).toBe(false);
    expect(matchesFilter(0, 0)).toBe(true);
  });
});

describe('mock keyword filters', () => {
  it('keeps raw includes case behaviour by default', () => {
    expect(includesKeyword('Al', 'Alpha', 'beta')).toBe(true);
    expect(includesKeyword('al', 'Alpha', 'beta')).toBe(false);
  });

  it('supports case-insensitive matching only when requested', () => {
    expect(includesKeyword('al', 'Alpha', { caseInsensitive: true })).toBe(true);
  });

  it('filters by selector fields', () => {
    const rows = [{ name: 'Alpha', code: 'A1' }, { name: 'Beta', code: 'B1' }];
    expect(filterByKeyword(rows, 'A1', [(row) => row.name, (row) => row.code])).toEqual([rows[0]]);
    expect(filterByKeyword(rows, '', [(row) => row.name])).toEqual(rows);
  });
});

describe('withinDateRange', () => {
  it('端点未传不限制；闭区间比较；纯日期终点补到当天 23:59:59', () => {
    expect(withinDateRange('2026-08-01 10:00:00', undefined, undefined)).toBe(true);
    expect(withinDateRange('2026-08-01 10:00:00', '2026-08-01 10:00:00', '2026-08-01 10:00:00')).toBe(true);
    expect(withinDateRange('2026-08-01 10:00:00', '2026-08-01 10:00:01', undefined)).toBe(false);
    expect(withinDateRange('2026-08-01 23:30:00', undefined, '2026-08-01')).toBe(true);
    expect(withinDateRange('2026-08-02 00:00:00', undefined, '2026-08-01')).toBe(false);
    expect(withinDateRange(null, '2026-08-01', undefined)).toBe(false);
  });
});
