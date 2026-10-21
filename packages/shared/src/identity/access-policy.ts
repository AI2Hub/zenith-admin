import type { PermissionMeta } from '../core/permissions';
import type { WorkflowFlowData } from '../workflow/types';
import type { AccessApprovalPolicy, AccessRiskLevel } from './access-governance-constants';
import type { AccessApprovalPlan, AccessPolicySnapshot } from './access-governance-validation';
import type { AccessSourceRef } from './access-governance-validation';
import type { DataScope } from './constants';

export const ACCESS_RISK_ORDER: Record<AccessRiskLevel, number> = { low: 0, high: 1, critical: 2 };
export const ACCESS_APPROVAL_ORDER: Record<AccessApprovalPolicy, number> = { none: 0, manager: 1, manager_security: 2, two_person: 3 };
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
    permanentAllowed: meta.permanentAllowed === true, emergencyAllowed: meta.emergencyAllowed === true, maxEmergencyMinutes: meta.maxEmergencyMinutes ?? 60,
    approvalPolicy: meta.approvalPolicy ?? (riskLevel === 'low' ? 'manager' : ACCESS_MINIMUM_APPROVAL[riskLevel]),
    maxDurationMinutes: meta.maxDurationMinutes ?? null,
    reviewIntervalDays: meta.reviewIntervalDays ?? (riskLevel === 'critical' ? 30 : riskLevel === 'high' ? 90 : 0),
    mfaRequired: riskLevel === 'critical',
    enabled: meta.selfRequestable !== false && meta.uiOnly !== true,
  };
}

export function effectiveAccessPolicy(baseline: AccessPolicySnapshot, configured?: {
  id: number; version: number; riskLevel: AccessRiskLevel; approvalPolicy: AccessApprovalPolicy; maxDurationMinutes?: number | null;
  reviewIntervalDays: number; mfaRequired: boolean; enabled: boolean; permanentAllowed: boolean; emergencyAllowed: boolean; maxEmergencyMinutes: number;
}): AccessPolicySnapshot {
  if (!configured) return baseline;
  const riskLevel = higherAccessRisk(baseline.riskLevel, configured.riskLevel);
  return {
    ...baseline, policyId: configured.id, version: configured.version, riskLevel,
    approvalPolicy: stricterAccessApproval(configured.approvalPolicy, ACCESS_MINIMUM_APPROVAL[riskLevel]),
    maxDurationMinutes: configured.maxDurationMinutes ?? null,
    reviewIntervalDays: riskLevel === 'low' ? configured.reviewIntervalDays : Math.min(configured.reviewIntervalDays || (riskLevel === 'critical' ? 30 : 90), riskLevel === 'critical' ? 30 : 90),
    mfaRequired: riskLevel === 'critical' || configured.mfaRequired,
    enabled: baseline.enabled && configured.enabled,
    permanentAllowed: configured.permanentAllowed, emergencyAllowed: configured.emergencyAllowed, maxEmergencyMinutes: configured.maxEmergencyMinutes,
  };
}

export function aggregateAccessPolicies(policies: readonly AccessPolicySnapshot[]) {
  const limits = policies.flatMap(policy => policy.maxDurationMinutes == null ? [] : [policy.maxDurationMinutes]);
  return {
    riskLevel: policies.reduce<AccessRiskLevel>((risk, policy) => higherAccessRisk(risk, policy.riskLevel), 'low'),
    approvalPolicy: policies.reduce<AccessApprovalPolicy>((mode, policy) => stricterAccessApproval(mode, policy.approvalPolicy), 'none'),
    maxDurationMinutes: limits.length ? Math.min(...limits) : null,
    mfaRequired: policies.some(policy => policy.mfaRequired),
    permanentAllowed: policies.every(policy => policy.permanentAllowed),
    emergencyAllowed: policies.every(policy => policy.emergencyAllowed),
    maxEmergencyMinutes: Math.min(...policies.map(policy => policy.maxEmergencyMinutes), 1440),
  };
}

export function accessScopesOverlap(a: { dataScope?: DataScope | null; deptScopeIds: number[] }, b: { dataScope?: DataScope | null; deptScopeIds: number[] }): boolean {
  if (a.dataScope === 'custom' && b.dataScope === 'custom') return a.deptScopeIds.some(id => b.deptScopeIds.includes(id));
  return true;
}

export function accessScopeKey(dataScope: DataScope, deptScopeIds: readonly number[]): string {
  const ids = dataScope === 'custom' ? [...new Set(deptScopeIds)].sort((a, b) => a - b) : [];
  if (ids.length > 100) throw new Error('单项自定义范围最多包含 100 个部门');
  return `${dataScope}:${ids.join(',')}`;
}

export function mergeAccessPermissionItems(items: ReadonlyArray<{
  permissionCode: string | null; permissionLabel?: string | null; dataScope?: DataScope | null; deptScopeIds: number[]; sourceRefs?: AccessSourceRef[];
}>) {
  const merged = new Map<string, { permissionCode: string; permissionLabel: string | null; dataScope: DataScope; deptScopeIds: number[]; scopeKey: string; sourceRefs: AccessSourceRef[] }>();
  for (const item of items) {
    if (!item.permissionCode) continue;
    const dataScope = item.dataScope ?? 'self';
    const deptScopeIds = dataScope === 'custom' ? [...new Set(item.deptScopeIds)].sort((a, b) => a - b) : [];
    const scopeKey = accessScopeKey(dataScope, deptScopeIds);
    const key = `${item.permissionCode}:${scopeKey}`;
    const previous = merged.get(key);
    const refs = [...(previous?.sourceRefs ?? []), ...(item.sourceRefs ?? [])];
    merged.set(key, { permissionCode: item.permissionCode, permissionLabel: item.permissionLabel ?? null, dataScope, deptScopeIds, scopeKey,
      sourceRefs: [...new Map(refs.map(ref => [JSON.stringify(ref), ref])).values()] });
  }
  return [...merged.values()];
}

export function accessPermissionCount(items: ReadonlyArray<{ permissionCode?: string | null }>): number {
  return new Set(items.flatMap(item => item.permissionCode ? [item.permissionCode] : [])).size;
}

/** 冻结完整流程及实际审批人，保留未命中分支供原有流程图展示和高亮。 */
export function buildAccessApprovalFlow(plan: AccessApprovalPlan, settings?: WorkflowFlowData['settings']): WorkflowFlowData {
  const template = buildAccessApprovalTemplate(settings);
  return {
    ...template,
    nodes: template.nodes.map<WorkflowFlowData['nodes'][number]>(node => {
      const step = plan.steps.find(item => item.nodeKey === node.data.key);
      if (!step) return node;
      return { ...node, data: {
        ...node.data, label: step.label, assigneeType: 'user', assigneeIds: [step.userId], approvalType: 'manual',
        approveMethod: 'or', emptyStrategy: 'reject', sameInitiatorStrategy: 'selfApprove', signaturePolicy: 'none',
        operations: ['opinionRequired'], fieldPermissions: {},
      } };
    }),
  };
}

/** 定义页展示可用策略分支；发起时由同域策略评估冻结为实际审批计划。 */
export function buildAccessApprovalTemplate(settings?: WorkflowFlowData['settings']): WorkflowFlowData {
  const approval = { approvalType: 'manual', approveMethod: 'or', emptyStrategy: 'reject', sameInitiatorStrategy: 'toDirectManager', fieldPermissions: {}, signaturePolicy: 'none' } as const;
  return {
    nodes: [
      { id: 'access-start', type: 'workflowNode', position: { x: 0, y: 0 }, data: { key: 'start', type: 'start', label: '发起' } },
      { id: 'access-policy', type: 'workflowNode', position: { x: 180, y: 0 }, data: { key: 'policy_gateway', type: 'exclusiveGateway', label: '有效审批策略' } },
      { id: 'access-manager', type: 'workflowNode', position: { x: 360, y: 0 }, data: { key: 'approve_manager', type: 'approve', label: '部门负责人审批', assigneeType: 'formUser', formUserField: 'managerId', ...approval } },
      { id: 'access-security-policy', type: 'workflowNode', position: { x: 540, y: 0 }, data: { key: 'security_gateway', type: 'exclusiveGateway', label: '是否需要安全审批' } },
      { id: 'access-security', type: 'workflowNode', position: { x: 720, y: 0 }, data: { key: 'approve_security', type: 'approve', label: '独立安全审批', assigneeType: 'formUser', formUserField: 'securityApproverId', ...approval } },
      { id: 'access-second-policy', type: 'workflowNode', position: { x: 900, y: 0 }, data: { key: 'second_gateway', type: 'exclusiveGateway', label: '是否需要第二安全审批' } },
      { id: 'access-second', type: 'workflowNode', position: { x: 1080, y: 0 }, data: { key: 'approve_second_security', type: 'approve', label: '第二独立安全审批', assigneeType: 'formUser', formUserField: 'secondSecurityApproverId', ...approval } },
      { id: 'access-invalid', type: 'workflowNode', position: { x: 540, y: 200 }, data: { key: 'policy_invalid', type: 'approve', label: '策略校验失败', approvalType: 'autoReject', approveMethod: 'or', emptyStrategy: 'reject' } },
      { id: 'access-end', type: 'workflowNode', position: { x: 1260, y: 0 }, data: { key: 'end', type: 'end', label: '结束' } },
    ],
    edges: [
      { id: 'access-start-policy', source: 'access-start', target: 'access-policy' },
      { id: 'access-auto', source: 'access-policy', target: 'access-end', condition: { field: 'approvalPolicy', operator: 'eq', value: 'none' } },
      { id: 'access-human', source: 'access-policy', target: 'access-manager', condition: { field: 'approvalPolicy', operator: 'in', value: 'manager,manager_security,two_person' } },
      { id: 'access-policy-invalid', source: 'access-policy', target: 'access-invalid', isDefault: true },
      { id: 'access-manager-policy', source: 'access-manager', target: 'access-security-policy' },
      { id: 'access-manager-end', source: 'access-security-policy', target: 'access-end', condition: { field: 'approvalPolicy', operator: 'eq', value: 'manager' } },
      { id: 'access-with-security', source: 'access-security-policy', target: 'access-security', condition: { field: 'approvalPolicy', operator: 'in', value: 'manager_security,two_person' } },
      { id: 'access-security-invalid', source: 'access-security-policy', target: 'access-invalid', isDefault: true },
      { id: 'access-security-second', source: 'access-security', target: 'access-second-policy' },
      { id: 'access-single-security-end', source: 'access-second-policy', target: 'access-end', condition: { field: 'approvalPolicy', operator: 'eq', value: 'manager_security' } },
      { id: 'access-with-second', source: 'access-second-policy', target: 'access-second', condition: { field: 'approvalPolicy', operator: 'eq', value: 'two_person' } },
      { id: 'access-second-invalid', source: 'access-second-policy', target: 'access-invalid', isDefault: true },
      { id: 'access-second-end', source: 'access-second', target: 'access-end' },
      { id: 'access-invalid-end', source: 'access-invalid', target: 'access-end' },
    ],
    settings: { ...settings, notifyInitiator: true, approverDedupMode: 'none', allowResubmit: false, allowWithdraw: true, summaryFields: ['targetUserName', 'riskLabel', 'expiresAt'] },
  };
}
