import { and, asc, desc, gt, inArray } from 'drizzle-orm';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import { aggregateAccessPolicies, higherAccessRisk, type AccessPolicySnapshot, type AccessRiskLevel } from '@zenith/shared/identity';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { departments, identityAccessReviewItems, userRoles, userGroupMembers, users, type IdentityAccessReviewCampaignRow, type NewIdentityAccessReviewItem } from '../../db/schema';
import { exactTenantCondition } from '../../lib/tenant';
import { buildWhere } from '../../lib/where-helpers';
import { formatDateTime } from '../../lib/datetime';
import { extractEnabledGroupRoles } from '../../lib/user-group-access';

type ReviewSource = Omit<NewIdentityAccessReviewItem, 'campaignId' | 'reviewerId' | 'dueAt'> & { sourceId: number; previousReviewItemId?: number };
const sourceKey = (userId: number, sourceType: string, sourceId: number | null) => `${userId}:${sourceType}:${sourceId}`;

export async function expandReviewDepartmentIds(ids: readonly number[], tenantId: number | null, executor: DbExecutor = db): Promise<number[]> {
  const rows = await executor.select({ id: departments.id, parentId: departments.parentId }).from(departments).where(exactTenantCondition(departments.tenantId, tenantId));
  const selected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (selected.has(row.parentId) && !selected.has(row.id)) { selected.add(row.id); changed = true; }
  }
  return [...selected];
}

export async function collectAccessReviewSourceBatch(campaign: Pick<IdentityAccessReviewCampaignRow, 'tenantId' | 'scopeType' | 'scopeIds' | 'dueOnly'>, afterUserId: number, policies: ReadonlyMap<string, AccessPolicySnapshot>, departmentIds: readonly number[] = [], executor: DbExecutor = db) {
  const role = { columns: { id: true, name: true, code: true, status: true, dataScope: true, permissionCodes: true, permissionVersion: true } } as const;
  const userRows = await executor.query.users.findMany({
    where: buildWhere(exactTenantCondition(users.tenantId, campaign.tenantId), gt(users.id, afterUserId),
      campaign.scopeType === 'user' ? inArray(users.id, campaign.scopeIds) : undefined,
      campaign.scopeType === 'department' ? inArray(users.departmentId, [...departmentIds]) : undefined,
      campaign.scopeType === 'role' ? inArray(users.id, executor.select({ userId: userRoles.userId }).from(userRoles).where(inArray(userRoles.roleId, campaign.scopeIds))) : undefined,
      campaign.scopeType === 'group' ? inArray(users.id, executor.select({ userId: userGroupMembers.userId }).from(userGroupMembers).where(inArray(userGroupMembers.groupId, campaign.scopeIds))) : undefined),
    columns: { id: true, status: true },
    with: {
      userRoles: { columns: { createdAt: true }, with: { role } },
      directPermissions: true,
      userGroupMembers: { columns: { createdAt: true }, with: { group: { columns: { id: true, name: true, status: true, memberMode: true }, with: { groupRoles: { columns: {}, with: { role } } } } } },
      accessGrants: { columns: { id: true, status: true }, with: { items: true } },
    },
    orderBy: [asc(users.id)], limit: 200,
  });
  if (!userRows.length) return { cursor: afterUserId, exhausted: true, sources: [] as ReviewSource[] };
  const userIds = userRows.map(user => user.id);
  const userStates = new Map(userRows.map(user => [user.id, user.status]));
  const latest = await executor.selectDistinctOn([identityAccessReviewItems.userId, identityAccessReviewItems.sourceType, identityAccessReviewItems.sourceId], {
    id: identityAccessReviewItems.id, userId: identityAccessReviewItems.userId, sourceType: identityAccessReviewItems.sourceType, sourceId: identityAccessReviewItems.sourceId,
    decision: identityAccessReviewItems.decision, nextReviewAt: identityAccessReviewItems.nextReviewAt, decidedAt: identityAccessReviewItems.decidedAt, createdAt: identityAccessReviewItems.createdAt,
  }).from(identityAccessReviewItems).where(and(exactTenantCondition(identityAccessReviewItems.tenantId, campaign.tenantId), inArray(identityAccessReviewItems.userId, userIds)))
    .orderBy(asc(identityAccessReviewItems.userId), asc(identityAccessReviewItems.sourceType), asc(identityAccessReviewItems.sourceId), desc(identityAccessReviewItems.createdAt), desc(identityAccessReviewItems.id));
  const history = new Map(latest.map(item => [sourceKey(item.userId, item.sourceType, item.sourceId), item]));
  const sources: ReviewSource[] = [];
  const now = new Date();
  const codesFromRole = (entry: (typeof userRows)[number]['userRoles'][number]['role']) => entry.permissionCodes.filter(code => ALL_PERMISSIONS[code] && !ALL_PERMISSIONS[code].uiOnly);
  const append = (input: { userId: number; sourceType: ReviewSource['sourceType']; sourceId: number; sourceLabel: string; permissionCode?: string; permissionLabel?: string; codes: string[]; riskFloor?: AccessRiskLevel; sourceCreatedAt: Date; snapshot: Record<string, unknown> }) => {
    const codes = [...new Set(input.codes)];
    const policyRows = codes.flatMap(code => { const policy = policies.get(code); return policy ? [policy] : []; });
    const riskLevel = higherAccessRisk(policyRows.length ? aggregateAccessPolicies(policyRows).riskLevel : 'low', input.riskFloor ?? 'low');
    if (campaign.scopeType === 'high_risk' && riskLevel === 'low') return;
    const intervals = policyRows.map(policy => policy.reviewIntervalDays).filter(days => days > 0);
    const interval = riskLevel === 'critical' ? Math.min(...intervals, 30) : riskLevel === 'high' ? Math.min(...intervals, 90) : intervals.length ? Math.min(...intervals) : 0;
    const previous = history.get(sourceKey(input.userId, input.sourceType, input.sourceId));
    if (previous?.decision === 'pending') return;
    if (campaign.dueOnly) {
      const dueAt = previous?.nextReviewAt ?? (interval > 0 ? new Date((previous?.decidedAt ?? input.sourceCreatedAt).getTime() + interval * 86_400_000) : null);
      if (!dueAt || dueAt > now) return;
    }
    sources.push({ userId: input.userId, tenantId: campaign.tenantId, sourceType: input.sourceType, sourceId: input.sourceId, sourceLabel: input.sourceLabel,
      permissionCode: input.permissionCode ?? null, permissionLabel: input.permissionLabel ?? null, riskLevel, decision: 'pending', previousReviewItemId: previous?.id,
      snapshot: { ...input.snapshot, accountStatus: userStates.get(input.userId), permissionCodes: codes, reviewIntervalDays: interval, sourceCreatedAt: formatDateTime(input.sourceCreatedAt), capturedAt: formatDateTime(now) } });
  };
  for (const user of userRows) {
    if (!['group', 'temporary'].includes(campaign.scopeType)) for (const binding of user.userRoles) {
      if (binding.role.status !== 'enabled' || (campaign.scopeType === 'role' && !campaign.scopeIds.includes(binding.role.id))) continue;
      const codes = codesFromRole(binding.role);
      const riskFloor = ['security_admin', 'tenant_admin', 'super_admin'].includes(binding.role.code) ? 'critical' : 'low';
      append({ userId: user.id, sourceType: 'role', sourceId: binding.role.id, sourceLabel: `角色：${binding.role.name}`, codes, riskFloor, sourceCreatedAt: binding.createdAt, snapshot: { roleId: binding.role.id, roleCode: binding.role.code, roleName: binding.role.name, roleVersion: binding.role.permissionVersion, dataScope: binding.role.dataScope } });
    }
    if (!['role', 'temporary'].includes(campaign.scopeType)) for (const membership of user.userGroupMembers) {
      if (campaign.scopeType === 'group' && !campaign.scopeIds.includes(membership.group.id)) continue;
      const inherited = extractEnabledGroupRoles([membership]);
      if (!inherited.groups.length) continue;
      append({ userId: user.id, sourceType: 'group_membership', sourceId: membership.group.id, sourceLabel: `用户组资格：${membership.group.name}`, codes: inherited.roles.flatMap(codesFromRole), riskFloor: inherited.roles.some(role => ['security_admin', 'tenant_admin', 'super_admin'].includes(role.code)) ? 'critical' : 'low', sourceCreatedAt: membership.createdAt,
        snapshot: { groupId: membership.group.id, groupName: membership.group.name, memberMode: membership.group.memberMode, roleIds: inherited.roles.map(entry => entry.id), roleNames: inherited.roles.map(entry => entry.name), revocationUnit: '整个用户组成员资格' } });
    }
    if (!['role', 'group', 'temporary'].includes(campaign.scopeType)) for (const entry of user.directPermissions) {
      if (!ALL_PERMISSIONS[entry.permissionCode]) continue;
      append({ userId: user.id, sourceType: 'direct_permission', sourceId: entry.id, sourceLabel: '用户直接授权', permissionCode: entry.permissionCode,
        permissionLabel: ALL_PERMISSIONS[entry.permissionCode].label, codes: [entry.permissionCode], sourceCreatedAt: entry.createdAt,
        snapshot: { directPermissionId: entry.id, dataScope: entry.dataScope, deptScopeIds: entry.deptScopeIds } });
    }
    if (!['role', 'group'].includes(campaign.scopeType)) for (const grant of user.accessGrants) {
      if (!['scheduled', 'active'].includes(grant.status)) continue;
      for (const item of grant.items) {
        if (!['scheduled', 'active'].includes(item.status) || (item.expiresAt && item.expiresAt <= now)) continue;
        append({ userId: user.id, sourceType: 'temporary_grant', sourceId: item.id, sourceLabel: `临时授权 #${grant.id} · 授权项 #${item.id}`, permissionCode: item.permissionCode, permissionLabel: item.permissionLabel ?? undefined, codes: [item.permissionCode], sourceCreatedAt: item.startsAt,
          snapshot: { grantId: grant.id, grantItemId: item.id, sourceRefs: item.sourceRefs, dataScope: item.dataScope, deptScopeIds: item.deptScopeIds, startsAt: formatDateTime(item.startsAt), expiresAt: item.expiresAt ? formatDateTime(item.expiresAt) : null } });
      }
    }
  }
  return { cursor: userIds[userIds.length - 1], exhausted: userRows.length < 200, sources };
}
