import { describe, expect, it } from 'vitest';
import {
  aclRevokeWarning,
  approvalConflictMessage,
  dqRunStatusLabel,
  dqTaskSubmissionMessage,
  isRevisionConflict,
  metricLifecyclePayload,
  normalizeAclGrantValues,
  normalizeDqRuleFormValues,
  normalizeMetricFormValues,
  normalizeTemplateApplyValues,
  supportsMetricBinding,
  switchAlertSource,
  validateQuotaForm,
} from './report-platform-utils';

describe('report platform form and lifecycle helpers', () => {
  it('validates metric source rules and optimistic lifecycle revisions', () => {
    const metric = normalizeMetricFormValues({
      code: 'paid_amount',
      name: '支付金额',
      type: 'simple',
      datasetId: 3,
      sourceField: 'amount',
      aggregate: 'sum',
      dimensions: 'shop_id, day',
    });
    expect(metric.dimensions).toEqual(['shop_id', 'day']);
    expect(() => normalizeMetricFormValues({
      code: 'ratio',
      name: '转化率',
      type: 'ratio',
      datasetId: 3,
    })).toThrow('公式');
    expect(metricLifecyclePayload(7, '  ready  ')).toEqual({ expectedRevision: 7, reason: 'ready' });
    expect(() => metricLifecyclePayload(0)).toThrow();
  });

  it('normalizes DQ configuration and exposes async task status feedback', () => {
    const rule = normalizeDqRuleFormValues({
      datasetId: 2,
      name: '金额范围',
      type: 'range',
      field: 'amount',
      severity: 'high',
      min: 0,
      max: 1000,
      enabled: true,
    }, false);
    expect(rule.config).toEqual({ min: 0, max: 1000 });
    expect(dqTaskSubmissionMessage({ id: 42 })).toContain('#42');
    expect(dqRunStatusLabel('running')).toBe('运行中');
  });

  it('normalizes ACL grants and keeps revoke destructive messaging explicit', () => {
    expect(normalizeAclGrantValues('dataset', 8, {
      subjectType: 'user',
      subjectId: '12',
      role: 'viewer',
      inheritFromFolder: true,
      expiresAt: '2026-08-01 09:00:00',
    })).toMatchObject({ resourceType: 'dataset', resourceId: 8, subjectId: 12, role: 'viewer' });
    expect(aclRevokeWarning()).toContain('立即失去');
  });

  it('detects approval conflicts without masking ordinary failures', () => {
    expect(isRevisionConflict({ code: 409 })).toBe(true);
    expect(approvalConflictMessage({ code: 409 })).toContain('修订已变化');
    expect(approvalConflictMessage(new Error('offline'))).toBeNull();
  });

  it('validates tenant and user quota form constraints', () => {
    const base = {
      maxConcurrent: 5,
      dailyQueryLimit: 100,
      dailyRowLimit: 1000,
      dailyByteLimit: 10000,
      dailyCostLimit: 50,
      resetTimezone: 'Asia/Shanghai',
      enabled: true,
    };
    expect(validateQuotaForm({ ...base, scope: 'tenant', userId: null }, false).scope).toBe('tenant');
    expect(() => validateQuotaForm({ ...base, scope: 'user', userId: null }, false)).toThrow('指定用户');
  });

  it('validates template apply overrides and alert source XOR switching', () => {
    expect(normalizeTemplateApplyValues({ name: '  月报副本  ', folderId: 3 })).toEqual({ name: '月报副本', folderId: 3 });
    expect(switchAlertSource('metric')).toEqual({ datasetId: null, field: null, groupByField: null });
    expect(switchAlertSource('dataset')).toEqual({ metricId: null });
  });

  it('allows metric binding only on supported value widgets', () => {
    expect((['kpi', 'gauge', 'flipper', 'liquid'] as const).every((type) => supportsMetricBinding(type))).toBe(true);
    expect(supportsMetricBinding('table')).toBe(false);
  });
});
