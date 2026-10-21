import { and, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import { accessPolicyBaseline, effectiveAccessPolicy, ACCESS_RISK_ORDER, ACCESS_APPROVAL_ORDER, ACCESS_MINIMUM_APPROVAL, type AccessPolicySnapshot, type UpdatePermissionPolicyInput } from '@zenith/shared/identity';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { identityPermissionPolicies } from '../../db/schema';
import { inheritedTenantCondition } from '../../lib/tenant';

/** Global policies can be inherited by every tenant, including absent override rows. */
export async function lockAccessPolicies(executor: DbExecutor) {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended('identity-access-policies', 0))`);
}

export async function readAccessPolicySet(permissionCodes: readonly string[], tenantId: number | null, executor: DbExecutor = db) {
  const codes = [...new Set(permissionCodes)].sort();
  if (!codes.length) return [];
  for (const code of codes) if (!ALL_PERMISSIONS[code]) throw new HTTPException(400, { message: `权限目录中未登记 ${code}，不能申请` });
  const rows = await executor.select().from(identityPermissionPolicies).where(and(inArray(identityPermissionPolicies.permissionCode, codes), inheritedTenantCondition(identityPermissionPolicies.tenantId, tenantId)));
  return codes.map((code) => {
    const record = rows.find(row => row.permissionCode === code && row.tenantId === tenantId)
      ?? rows.find(row => row.permissionCode === code && row.tenantId === null);
    return { policy: effectiveAccessPolicy(accessPolicyBaseline(code, ALL_PERMISSIONS[code]), record), record };
  });
}

export async function loadEffectiveAccessPolicies(permissionCodes: readonly string[], tenantId: number | null, executor: DbExecutor = db): Promise<AccessPolicySnapshot[]> {
  return (await readAccessPolicySet(permissionCodes, tenantId, executor)).map(entry => entry.policy);
}

function policySignature(policies: readonly AccessPolicySnapshot[]): string {
  return JSON.stringify([...policies].sort((a, b) => a.permissionCode.localeCompare(b.permissionCode)).map(p => [p.permissionCode, p.policyId, p.version, p.riskLevel, p.approvalPolicy, p.maxDurationMinutes, p.reviewIntervalDays, p.mfaRequired, p.enabled, p.permanentAllowed, p.emergencyAllowed, p.maxEmergencyMinutes]));
}

export async function assertAccessPolicySnapshotCurrent(snapshot: readonly AccessPolicySnapshot[], tenantId: number | null, executor: DbExecutor): Promise<void> {
  await lockAccessPolicies(executor);
  if (!snapshot.length) throw new HTTPException(409, { message: '权限申请缺少有效策略快照，请重新发起' });
  const current = await loadEffectiveAccessPolicies(snapshot.map(policy => policy.permissionCode), tenantId, executor);
  if (current.some(policy => !policy.enabled) || policySignature(current) !== policySignature(snapshot)) {
    throw new HTTPException(409, { message: '权限策略已变化，请撤回后按最新策略重新申请' });
  }
}

export function assertPermissionPolicyUpdate(permissionCode: string, input: UpdatePermissionPolicyInput): void {
  const meta = ALL_PERMISSIONS[permissionCode];
  if (!meta) throw new HTTPException(400, { message: '权限码未在权限目录中登记' });
  const baseline = accessPolicyBaseline(permissionCode, meta);
  if (ACCESS_RISK_ORDER[input.riskLevel] < ACCESS_RISK_ORDER[baseline.riskLevel]) throw new HTTPException(400, { message: '不能降低权限目录规定的最低风险等级' });
  if (ACCESS_APPROVAL_ORDER[input.approvalPolicy] < ACCESS_APPROVAL_ORDER[ACCESS_MINIMUM_APPROVAL[input.riskLevel]]) throw new HTTPException(400, { message: '审批策略不满足风险等级的最低要求' });
  if (input.riskLevel !== 'low' && (input.reviewIntervalDays <= 0 || input.reviewIntervalDays > (input.riskLevel === 'critical' ? 30 : 90))) throw new HTTPException(400, { message: '高危权限复核周期不得超过 90 天，极高危不得超过 30 天，且不能关闭复核' });
  if (input.riskLevel === 'critical' && !input.mfaRequired) throw new HTTPException(400, { message: '极高危权限必须启用审批 MFA' });
  if (input.approvalPolicy === 'none' && input.mfaRequired) throw new HTTPException(400, { message: '需要审批 MFA 时必须配置人工审批' });
  if (input.enabled && !baseline.enabled) throw new HTTPException(400, { message: '该能力不允许通过本人临时权限申请获取' });
}

export async function assertAccessSnapshotDuration(snapshot: readonly AccessPolicySnapshot[], startsAt: Date, expiresAt: Date | null, tenantId: number | null, executor: DbExecutor): Promise<void> {
  await assertAccessPolicySnapshotCurrent(snapshot, tenantId, executor);
  if (expiresAt === null) {
    if (snapshot.some(policy => !policy.permanentAllowed)) throw new HTTPException(409, { message: '当前策略不允许永久授权' });
    return;
  }
  if (expiresAt.getTime() <= Date.now()) throw new HTTPException(409, { message: '申请有效期已经结束，不能继续审批或发放' });
  const limits = snapshot.flatMap(policy => policy.maxDurationMinutes === null ? [] : [policy.maxDurationMinutes]);
  const limit = limits.length ? Math.min(...limits) : null;
  if (limit !== null && expiresAt.getTime() - startsAt.getTime() > limit * 60_000) throw new HTTPException(409, { message: `限时申请时长超过当前策略配置的 ${limit} 分钟` });
}
