import { describe, expect, it } from 'vitest';
import { CMS_STAT_MIN_RETENTION_DAYS, normalizeCmsSearchKeyword } from './cms-statistics';
import { cmsStatisticsCoverage } from './statistics-coverage';

describe('CMS statistics coverage', () => {
  const interval = { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z', knownSince: '2025-01-01T00:00:00Z', purgedThrough: null, firstEventAt: null,
    changes: [{ at: '2025-01-01T00:00:00Z', enabled: true }] };
  it('proves continuous collection independently of traffic volume', () => {
    expect(cmsStatisticsCoverage(interval)).toEqual({ available: true, reason: 'available' });
    expect(cmsStatisticsCoverage({ ...interval, changes: [...interval.changes, { at: interval.end, enabled: false }] }).available).toBe(true);
  });
  it('does not calculate comparisons across a pause or a purged period', () => {
    expect(cmsStatisticsCoverage({ ...interval, changes: [...interval.changes, { at: '2026-01-10T00:00:00Z', enabled: false }, { at: '2026-01-11T00:00:00Z', enabled: true }] }).reason).toBe('paused');
    expect(cmsStatisticsCoverage({ ...interval, purgedThrough: interval.start }).reason).toBe('retention');
  });
  it('distinguishes unobserved history and not-yet-started collection', () => {
    expect(cmsStatisticsCoverage({ ...interval, knownSince: null, changes: [], firstEventAt: interval.start }).reason).toBe('unknown');
    expect(cmsStatisticsCoverage({ ...interval, knownSince: null, changes: [] }).reason).toBe('not_started');
    expect(cmsStatisticsCoverage({ ...interval, changes: [] }).reason).toBe('unknown');
  });
  it('retains enough facts for a leap-year comparison of the maximum range', () => {
    expect(CMS_STAT_MIN_RETENTION_DAYS).toBeGreaterThan(366 + 90 + 1);
    expect(normalizeCmsSearchKeyword('  QA文化Portal  ')).toBe('qa文化portal');
  });
});
