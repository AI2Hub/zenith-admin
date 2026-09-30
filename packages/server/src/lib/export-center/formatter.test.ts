import { describe, expect, it } from 'vitest';
import { formatExportValue } from './formatter';

describe('export date cells', () => {
  it.each(['date', 'datetime'] as const)('%s preserves missing dates as empty cells', (type) => {
    for (const at of [null, undefined, '', '   ']) {
      expect(formatExportValue({ key: 'at', header: '时间', type }, { at })).toBe('');
    }
  });

  it('formats real wall dates and keeps the Unix epoch valid', () => {
    expect(formatExportValue({ key: 'at', header: '时间', type: 'datetime' }, { at: '2026-09-30 08:03:11' })).toBe('2026-09-30 08:03:11');
    expect(formatExportValue({ key: 'at', header: '日期', type: 'date' }, { at: '2026-09-30' })).toBe('2026-09-30');
    expect(formatExportValue({ key: 'at', header: '时间', type: 'datetime' }, { at: 0 })).toMatch(/^1970-01-01 /);
  });

  it('keeps non-date formatting and transforms intact', () => {
    expect(formatExportValue({ key: 'value', header: '名称' }, { value: '   ' })).toBe('   ');
    expect(formatExportValue({ key: 'value', header: '启用', type: 'boolean' }, { value: false })).toBe('否');
    expect(formatExportValue({ key: 'value', header: '金额', type: 'money' }, { value: 0 })).toBe('0.00');
    expect(formatExportValue({ key: 'value', header: '日期', type: 'date', transform: () => '' }, { value: 'placeholder' })).toBe('');
  });
});
