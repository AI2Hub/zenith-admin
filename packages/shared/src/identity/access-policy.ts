import type { PermissionMeta } from '../core/permissions';
import type { WorkflowFlowData } from '../workflow/types';
import type { AccessApprovalPolicy, AccessRiskLevel } from './access-governance-constants';
import type { AccessApprovalPlan, AccessPolicySnapshot } from './access-governance-validation';
import type { DataScope } from './constants';

export const ACCESS_RISK_ORDER: Record<AccessRiskLevel, number> = { low: 0, high: 1, critical: 2 };
export const ACCESS_APPROVAL_ORDER: Record<AccessApprovalPolicy, number> = { none: 0, manager: 1, manager_security: 2, two_person: 3 };
export const ACCESS_RISK_DURATION_LIMITS: Record<AccessRiskLevel, number> = { low: 43200, high: 480, critical: 120 };
export const ACCESS_MINIMUM_APPROVAL: Record<AccessRiskLevel, AccessApprovalPolicy> = { low: 'none', high: 'manager_security', critical: 'two_person' };

export function higherAccessRisk(a: AccessRiskLevel, b: AccessRiskLevel): AccessRiskLevel {
  return ACCESS_RISK_ORDER[a] >= ACCESS_RISK_ORDER[b] ? a : b;
}

export function stricterAccessApproval(a: AccessApprovalPolicy, b: AccessApprovalPolicy): AccessApprovalPolicy {
  return ACCESS_APPROVAL_ORDER[a] >= ACCESS_APPROVAL_ORDER[b] ? a : b;
}

export function accessPolicyBaseline(permissionCode: string, meta: PermissionMeta): AccessPolicySnapshot {
  const riskLevel = meta.riskLevel ?? 'low';
  return {
    permissionCode, policyId: null, version: 0, riskLevel,
    approvalPolicy: meta.approvalPolicy ?? (riskLevel === 'low' ? 'manager' : ACCESS_MINIMUM_APPROVAL[riskLevel]),
    maxDurationMinutes: Math.min(meta.maxDurationMinutes ?? 480, ACCESS_RISK_DURATION_LIMITS[riskLevel]),
    reviewIntervalDays: meta.reviewIntervalDays ?? (riskLevel === 'critical' ? 30 : riskLevel === 'high' ? 90 : 0),
    mfaRequired: riskLevel === 'critical',
    enabled: meta.selfRequestable !== false && meta.uiOnly !== true,
  };
}

export function effectiveAccessPolicy(baseline: AccessPolicySnapshot, configured?: {
  id: number; version: number; riskLevel: AccessRiskLevel; approvalPolicy: AccessApprovalPolicy; maxDurationMinutes?: number | null;
  reviewIntervalDays: number; mfaRequired: boolean; enabled: boolean;
}): AccessPolicySnapshot {
  if (!configured) return baseline;
  const riskLevel = higherAccessRisk(baseline.riskLevel, configured.riskLevel);
  return {
    ...baseline, policyId: configured.id, version: configured.version, riskLevel,
    approvalPolicy: stricterAccessApproval(configured.approvalPolicy, ACCESS_MINIMUM_APPROVAL[riskLevel]),
    maxDurationMinutes: Math.min(configured.maxDurationMinutes ?? baseline.maxDurationMinutes, ACCESS_RISK_DURATION_LIMITS[riskLevel]),
    reviewIntervalDays: riskLevel === 'low' ? configured.reviewIntervalDays : Math.min(configured.reviewIntervalDays || (riskLevel === 'critical' ? 30 : 90), riskLevel === 'critical' ? 30 : 90),
    mfaRequired: riskLevel === 'critical' || configured.mfaRequired,
    enabled: baseline.enabled && configured.enabled,
  };
}

export function aggregateAccessPolicies(policies: readonly AccessPolicySnapshot[]) {
  return {
    riskLevel: policies.reduce<AccessRiskLevel>((risk, policy) => higherAccessRisk(risk, policy.riskLevel), 'low'),
    approvalPolicy: policies.reduce<AccessApprovalPolicy>((mode, policy) => stricterAccessApproval(mode, policy.approvalPolicy), 'none'),
    maxDurationMinutes: Math.min(...policies.map(policy => policy.maxDurationMinutes)),
    mfaRequired: policies.some(policy => policy.mfaRequired),
  };
}

export function accessScopesOverlap(a: { dataScope?: DataScope | null; deptScopeIds: number[] }, b: { dataScope?: DataScope | null; deptScopeIds: number[] }): boolean {
  if (a.dataScope === 'custom' && b.dataScope === 'custom') return a.deptScopeIds.some(id => b.deptScopeIds.includes(id));
  return true;
}

export function mergeAccessPermissionItems(items: ReadonlyArray<{
  menuId: number | null; permissionCode: string | null; permissionLabel?: string | null; dataScope?: DataScope | null; deptScopeIds: number[];
}>) {
  const merged = new Map<string, { menuId: number; permissionCode: string; permissionLabel: string | null; dataScope: DataScope; deptScopeIds: number[] }>();
  for (const item of items) {
    if (item.menuId === null || !item.permissionCode) continue;
    const dataScope = item.dataScope ?? 'self';
    const key = `${item.permissionCode}:${dataScope}`;
    const existing = merged.get(key);
    merged.set(key, {
      menuId: existing?.menuId ?? item.menuId, permissionCode: item.permissionCode, permissionLabel: item.permissionLabel ?? null, dataScope,
      deptScopeIds: [...new Set([...(existing?.deptScopeIds ?? []), ...item.deptScopeIds])].sort((a, b) => a - b),
    });
  }
  return [...merged.values()];
}

/** 将已解析的策略计划冻结为实际执行链，配置编辑不能绕过业务审批要求。 */
export function buildAccessApprovalFlow(plan: AccessApprovalPlan, settings?: WorkflowFlowData['settings']): WorkflowFlowData {
  const nodes: WorkflowFlowData['nodes'] = [
    { id: 'access-start', type: 'workflowNode', position: { x: 0, y: 0 }, data: { key: 'start', type: 'start', label: '发起' } },
    ...plan.steps.map<WorkflowFlowData['nodes'][number]>((step, index) => ({
      id: step.nodeKey, type: 'workflowNode' as const, position: { x: (index + 1) * 220, y: 0 },
      data: { key: step.nodeKey, type: 'approve' as const, label: step.label, assigneeType: 'user' as const, assigneeIds: [step.userId], approvalType: 'manual' as const,
        approveMethod: 'or' as const, emptyStrategy: 'reject' as const, sameInitiatorStrategy: 'selfApprove' as const, signaturePolicy: 'none' as const,
        operations: ['opinionRequired'], fieldPermissions: {} },
    })),
    { id: 'access-end', type: 'workflowNode', position: { x: (plan.steps.length + 1) * 220, y: 0 }, data: { key: 'end', type: 'end', label: '结束' } },
  ];
  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `access-edge-${index}`, source: nodes[index].id, target: node.id })),
    settings: { ...settings, notifyInitiator: true, approverDedupMode: 'none', allowResubmit: false, allowWithdraw: true, summaryFields: ['targetUserName', 'riskLabel', 'expiresAt'] },
  };
}
