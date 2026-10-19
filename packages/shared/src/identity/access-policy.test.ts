import { describe, expect, it } from 'vitest';
import { planWorkflowPath } from '../workflow/path-planner';
import { accessWorkflowInputSchema } from './access-governance-validation';
import { accessPolicyBaseline, aggregateAccessPolicies, buildAccessApprovalFlow, buildAccessApprovalTemplate, effectiveAccessPolicy, mergeAccessPermissionItems } from './access-policy';

const form = { menuIds: [1], reason: '权限治理有效期测试', requestType: 'temporary', startMode: 'immediate' };

describe('explicit limited and permanent access validity', () => {
  it('accepts permanent grants without an artificial maximum duration', () => {
    expect(accessWorkflowInputSchema.parse({ ...form, validityMode: 'permanent', expiresAt: null }).expiresAt).toBeNull();
    expect(accessWorkflowInputSchema.safeParse({ ...form, validityMode: 'limited', expiresAt: '2030-10-19 12:00:00' }).success).toBe(true);
  });
  it('does not confuse an omitted limited expiry with permanent intent', () => {
    expect(accessWorkflowInputSchema.safeParse({ ...form, validityMode: 'limited', expiresAt: null }).success).toBe(false);
    expect(accessWorkflowInputSchema.safeParse({ ...form, expiresAt: null }).success).toBe(false);
    expect(accessWorkflowInputSchema.safeParse({ ...form, validityMode: 'permanent', expiresAt: '2030-10-19 12:00:00' }).success).toBe(false);
  });
  it('keeps independent approval and MFA floors without forcing risk-based expiration', () => {
    const baseline = accessPolicyBaseline('example:write', { label: '写入', menu: 'Example', riskLevel: 'critical' });
    const policy = effectiveAccessPolicy(baseline, { id: 1, version: 2, riskLevel: 'low', approvalPolicy: 'none', maxDurationMinutes: null, reviewIntervalDays: 365, mfaRequired: false, enabled: true });
    expect(policy).toMatchObject({ riskLevel: 'critical', approvalPolicy: 'two_person', mfaRequired: true, reviewIntervalDays: 30, maxDurationMinutes: null });
  });
  it('only aggregates explicitly configured limits for limited validity', () => {
    const base = accessPolicyBaseline('example:list', { label: '查询', menu: 'Example' });
    expect(aggregateAccessPolicies([base]).maxDurationMinutes).toBeNull();
    expect(aggregateAccessPolicies([base, { ...base, maxDurationMinutes: 1440 }]).maxDurationMinutes).toBe(1440);
  });
});

describe('access policy template and resolved execution plan', () => {
  it.each([
    ['none', []], ['manager', ['approve_manager']], ['manager_security', ['approve_manager', 'approve_security']],
    ['two_person', ['approve_manager', 'approve_security', 'approve_second_security']],
  ] as const)('routes the template from effective policy %s rather than request labels', (approvalPolicy, expected) => {
    const plan = planWorkflowPath(buildAccessApprovalTemplate(), { formData: { approvalPolicy, requestType: 'emergency', validityMode: 'permanent' } });
    expect(plan.nodes.filter(node => node.nodeType === 'approve' && node.status === 'matched').map(node => node.nodeKey)).toEqual(expected);
  });
  it('freezes resolved people and disables resubmission without losing independence', () => {
    const flow = buildAccessApprovalFlow({ approvalPolicy: 'manager_security', mfaRequired: false, steps: [
      { nodeKey: 'approve_manager', label: '负责人', userId: 7, userName: '主管', reason: '部门负责人' },
      { nodeKey: 'approve_security', label: '安全审批', userId: 8, userName: '安全员', reason: '独立安全审批' },
    ] });
    expect(flow.nodes.filter(node => node.data.type === 'approve').map(node => node.data.assigneeIds)).toEqual([[7], [8]]);
    expect(flow.settings).toMatchObject({ allowResubmit: false, approverDedupMode: 'none' });
  });
  it('preserves per-permission data scopes when expanding role packages', () => {
    const items = mergeAccessPermissionItems([
      { menuId: 1, permissionCode: 'example:list', dataScope: 'all', deptScopeIds: [] },
      { menuId: 2, permissionCode: 'example:edit', dataScope: 'self', deptScopeIds: [] },
      { menuId: 2, permissionCode: 'example:edit', dataScope: 'custom', deptScopeIds: [3] },
      { menuId: 2, permissionCode: 'example:edit', dataScope: 'custom', deptScopeIds: [4] },
    ]);
    expect(items).toHaveLength(3);
    expect(items.find(item => item.dataScope === 'custom')?.deptScopeIds).toEqual([3, 4]);
    expect(items.find(item => item.permissionCode === 'example:edit' && item.dataScope === 'self')).toBeDefined();
  });
});
