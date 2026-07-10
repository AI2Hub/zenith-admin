import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  assertGovernedResourceRevision,
  assertPendingGovernanceStatus,
  isPromotionTransitionAllowed,
  reportResourceSnapshotsEqual,
} from './report-governance.service';
import {
  assertReportMetricReferenceStack,
  assertReportMetricRevision,
} from './report-metric.service';

describe('metric optimistic revision and references', () => {
  it('returns conflict for stale revisions', () => {
    expect(() => assertReportMetricRevision(4, 3)).toThrow(HTTPException);
    try {
      assertReportMetricRevision(4, 3);
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPException);
      expect((error as HTTPException).status).toBe(409);
    }
    expect(() => assertReportMetricRevision(4, 4)).not.toThrow();
  });

  it('detects reference cycles and recursion depth', () => {
    expect(() => assertReportMetricReferenceStack(1, [1])).toThrow('循环引用');
    expect(() => assertReportMetricReferenceStack(11, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toThrow('引用深度');
    expect(() => assertReportMetricReferenceStack(3, [1, 2])).not.toThrow();
  });
});

describe('governance transitions', () => {
  it('rejects stale approval revisions', () => {
    expect(() => assertGovernedResourceRevision(6, 5, '审批请求已失效')).toThrow('审批请求已失效');
    expect(() => assertGovernedResourceRevision(5, 5)).not.toThrow();
  });

  it('allows transfer/approval decisions only while pending', () => {
    expect(() => assertPendingGovernanceStatus('pending', '资源转移申请')).not.toThrow();
    expect(() => assertPendingGovernanceStatus('accepted', '资源转移申请')).toThrow('已处理');
    expect(() => assertPendingGovernanceStatus('approved', '发布审批')).toThrow('已处理');
  });

  it('enforces promotion state transitions including rollback', () => {
    expect(isPromotionTransitionAllowed('pending', 'approve')).toBe(true);
    expect(isPromotionTransitionAllowed('approved', 'deploy')).toBe(true);
    expect(isPromotionTransitionAllowed('succeeded', 'rollback')).toBe(true);
    expect(isPromotionTransitionAllowed('pending', 'deploy')).toBe(false);
    expect(isPromotionTransitionAllowed('rolled_back', 'rollback')).toBe(false);
  });

  it('detects stale promotion snapshots independent of object key order', () => {
    expect(reportResourceSnapshotsEqual(
      { revision: 1, config: { b: 2, a: 1 } },
      { config: { a: 1, b: 2 }, revision: 1 },
    )).toBe(true);
    expect(reportResourceSnapshotsEqual({ revision: 1 }, { revision: 2 })).toBe(false);
  });
});
