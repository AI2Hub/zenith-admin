import { describe, expect, it } from 'vitest';
import { columnKind, copyValue, displayValue, hasDetail, shortTypeName } from './grid-format';
import { COL_MAX_WIDTH, COL_MIN_WIDTH, estimateColumnWidth } from './column-width';

describe('columnKind', () => {
  it('识别常见 PG 类型', () => {
    expect(columnKind('boolean')).toBe('bool');
    expect(columnKind('integer')).toBe('int');
    expect(columnKind('bigint')).toBe('int');
    expect(columnKind('numeric')).toBe('number');
    expect(columnKind('double precision')).toBe('number');
    expect(columnKind('jsonb')).toBe('json');
    expect(columnKind('timestamp without time zone')).toBe('datetime');
    expect(columnKind('date')).toBe('date');
    expect(columnKind('uuid')).toBe('uuid');
    expect(columnKind('character varying')).toBe('text');
    expect(columnKind(undefined)).toBe('text');
  });
});

describe('displayValue / copyValue', () => {
  it('NULL 显示为空串', () => {
    expect(displayValue(null, 'text')).toBe('');
    expect(copyValue(undefined)).toBe('');
  });

  it('对象序列化为 JSON', () => {
    expect(displayValue({ a: 1 }, 'json')).toBe('{"a":1}');
  });

  it('布尔输出 true/false', () => {
    expect(displayValue(true, 'bool')).toBe('true');
    expect(displayValue(false, 'bool')).toBe('false');
  });

  it('datetime 类型统一格式化为 YYYY-MM-DD HH:mm:ss', () => {
    expect(displayValue('2026-03-23T14:30:00.000Z', 'datetime')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(displayValue('2026-03-23 14:30:00', 'datetime')).toBe('2026-03-23 14:30:00');
  });

  it('非 ISO 字符串原样返回', () => {
    expect(displayValue('hello', 'datetime')).toBe('hello');
  });
});

describe('hasDetail', () => {
  it('对象 / JSON / 长文本需要详情', () => {
    expect(hasDetail({ a: 1 }, 'json')).toBe(true);
    expect(hasDetail('x'.repeat(200), 'text')).toBe(true);
    expect(hasDetail('short', 'text')).toBe(false);
    expect(hasDetail(null, 'json')).toBe(false);
  });
});

describe('shortTypeName', () => {
  it('缩写常见冗长类型名', () => {
    expect(shortTypeName('character varying')).toBe('varchar');
    expect(shortTypeName('timestamp without time zone')).toBe('timestamp');
    expect(shortTypeName('integer')).toBe('integer');
  });
});

describe('estimateColumnWidth', () => {
  const rows = (values: unknown[]) => values.map((v) => ({ col: v }));

  it('结果在最小最大宽度之间', () => {
    const w1 = estimateColumnWidth({ name: 'col' }, rows(['a']));
    expect(w1).toBeGreaterThanOrEqual(COL_MIN_WIDTH);
    const w2 = estimateColumnWidth({ name: 'col' }, rows(['x'.repeat(500)]));
    expect(w2).toBe(COL_MAX_WIDTH);
  });

  it('内容更长列更宽', () => {
    const short = estimateColumnWidth({ name: 'col' }, rows(['abc']));
    const long = estimateColumnWidth({ name: 'col' }, rows(['abcdefghijklmnopqrstuvwxyz0123']));
    expect(long).toBeGreaterThan(short);
  });

  it('全角字符按更宽估算', () => {
    const ascii = estimateColumnWidth({ name: 'col' }, rows(['aaaaaaaaaaaaaaaaaaaa']));
    const cjk = estimateColumnWidth({ name: 'col' }, rows(['测试中文字符宽度估算共二十个字符宽度试试']));
    expect(cjk).toBeGreaterThan(ascii);
  });
});
