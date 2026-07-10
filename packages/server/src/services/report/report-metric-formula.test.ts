import { describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  aggregateMetricRows,
  analyzeMetricFormula,
  evaluateMetricFormula,
} from './report-metric-formula';

const rows = [
  { amount: 10, user_id: 1 },
  { amount: '20', user_id: 1 },
  { amount: 30, user_id: 2 },
  { amount: null, user_id: null },
];

describe('metric aggregation', () => {
  it('supports all semantic-layer aggregate operators', () => {
    expect(aggregateMetricRows(rows, 'amount', 'sum')).toBe(60);
    expect(aggregateMetricRows(rows, 'amount', 'avg')).toBe(20);
    expect(aggregateMetricRows(rows, 'amount', 'max')).toBe(30);
    expect(aggregateMetricRows(rows, 'amount', 'min')).toBe(10);
    expect(aggregateMetricRows(rows, 'amount', 'count')).toBe(3);
    expect(aggregateMetricRows(rows, 'user_id', 'distinct_count')).toBe(2);
    expect(aggregateMetricRows(rows, null, 'count')).toBe(4);
  });
});

describe('safe metric formulas', () => {
  it('evaluates aggregate fields and metric-code references', async () => {
    const resolve = vi.fn(async (code: string) => ({ orders: 3, tax: 5 })[code] ?? 0);
    await expect(evaluateMetricFormula('sum(amount) / orders + tax', rows, resolve)).resolves.toBe(25);
    expect(resolve).toHaveBeenCalledWith('orders');
    expect(resolve).toHaveBeenCalledWith('tax');
    expect(analyzeMetricFormula('sum(amount) / orders')).toEqual({
      metricCodes: ['orders'],
      fields: ['amount'],
    });
  });

  it('rejects unsafe syntax, missing references, and division by zero', async () => {
    expect(() => analyzeMetricFormula('obj.value')).toThrow(HTTPException);
    await expect(evaluateMetricFormula('missing + 1', rows, async (code) => {
      throw new HTTPException(400, { message: `指标引用不存在：${code}` });
    })).rejects.toThrow('指标引用不存在');
    await expect(evaluateMetricFormula('sum(amount) / 0', rows, async () => 0)).rejects.toThrow('除数不能为 0');
  });
});
