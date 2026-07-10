import { describe, expect, it } from 'vitest';
import {
  BoundedSemaphore,
  calculateQueryCost,
  parseReportQueryCostRange,
  resolveQuotaDay,
} from './report-query-capacity.service';

describe('report query capacity and quotas', () => {
  it('bounds active work and queue depth without broad locks', async () => {
    const semaphore = new BoundedSemaphore(1, 1, 1_000);
    const first = await semaphore.acquire();
    const secondPromise = semaphore.acquire();
    expect(semaphore.activeCount).toBe(1);
    expect(semaphore.queueDepth).toBe(1);
    expect(() => semaphore.acquire()).toThrow('队列已满');
    first.release();
    const second = await secondPromise;
    expect(semaphore.activeCount).toBe(1);
    expect(semaphore.queueDepth).toBe(0);
    second.release();
    second.release();
    expect(semaphore.activeCount).toBe(0);
  });

  it('uses timezone-aware daily keys across UTC day boundaries', () => {
    expect(resolveQuotaDay(new Date('2026-03-08T04:30:00.000Z'), 'America/New_York').day)
      .toBe('2026-03-07');
    expect(resolveQuotaDay(new Date('2026-03-08T05:30:00.000Z'), 'America/New_York').day)
      .toBe('2026-03-08');
  });

  it('calculates lower cache cost and validates the 90-day range', () => {
    const cold = calculateQueryCost({ durationMs: 1_000, rows: 10_000, bytes: 1_048_576, cacheHit: false });
    const hot = calculateQueryCost({ durationMs: 1_000, rows: 10_000, bytes: 1_048_576, cacheHit: true });
    expect(hot).toBe(cold / 4);
    expect(() => parseReportQueryCostRange('2026-01-01', '2026-04-02')).toThrow('90 天');
    expect(() => parseReportQueryCostRange('2026-04-02', '2026-04-01')).toThrow('开始时间');
    expect(parseReportQueryCostRange('2026-01-01', '2026-03-31').startAt).toBeInstanceOf(Date);
  });
});
