import { describe, expect, it } from 'vitest';
import {
  isSlaThresholdViolated,
  shouldNotifySlaViolation,
} from './report-sla.service';
import { validateReportAssetTemplateContent } from './report-asset.service';

describe('report SLA transitions', () => {
  it('applies upper and lower threshold semantics', () => {
    expect(isSlaThresholdViolated('freshness', 61, 60)).toBe(true);
    expect(isSlaThresholdViolated('query_latency_p95', 999, 1_000)).toBe(false);
    expect(isSlaThresholdViolated('availability', 99.8, 99.9)).toBe(true);
    expect(isSlaThresholdViolated('dq_score', 95, 90)).toBe(false);
  });

  it('honors notification silence windows', () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    expect(shouldNotifySlaViolation(null, 60, now)).toBe(true);
    expect(shouldNotifySlaViolation(new Date('2026-03-10T11:30:01.000Z'), 30, now)).toBe(false);
    expect(shouldNotifySlaViolation(new Date('2026-03-10T11:30:00.000Z'), 30, now)).toBe(true);
  });
});

describe('report asset template validation', () => {
  it('accepts governed snapshots for supported template types', () => {
    expect(() => validateReportAssetTemplateContent('dashboard', {})).not.toThrow();
    expect(() => validateReportAssetTemplateContent('widget', {
      i: 'w1',
      type: 'table',
      title: 'Table',
      options: {},
    })).not.toThrow();
    expect(() => validateReportAssetTemplateContent('print', {})).not.toThrow();
    expect(() => validateReportAssetTemplateContent('semantic_model', { datasourceId: 1 })).not.toThrow();
  });

  it('rejects invalid widget and semantic-model snapshots', () => {
    expect(() => validateReportAssetTemplateContent('widget', {
      i: 'w1',
      type: 'table',
      metricId: 1,
      options: {},
    })).toThrow('模板内容无效');
    expect(() => validateReportAssetTemplateContent('semantic_model', {})).toThrow('模板内容无效');
  });
});
