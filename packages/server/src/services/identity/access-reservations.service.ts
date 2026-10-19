import { and, eq, gt, inArray, lt, ne, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { mergeAccessPermissionItems, accessScopesOverlap } from '@zenith/shared/identity';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { identityAccessGrants, identityAccessRequests } from '../../db/schema';
import { exactTenantCondition } from '../../lib/tenant';
import { buildWhere } from '../../lib/where-helpers';

export async function assertNoOverlappingAccessRequest(input: {
  targetUserId: number; tenantId: number | null; startsAt: Date; expiresAt: Date;
  items: Parameters<typeof mergeAccessPermissionItems>[0]; excludeRequestId?: number; excludeGrantItemId?: number;
}, executor: DbExecutor = db): Promise<void> {
  const requested = mergeAccessPermissionItems(input.items);
  if (!requested.length) return;
  const [grants, requests] = await Promise.all([
    executor.query.identityAccessGrants.findMany({
      where: and(eq(identityAccessGrants.userId, input.targetUserId), exactTenantCondition(identityAccessGrants.tenantId, input.tenantId), inArray(identityAccessGrants.status, ['scheduled', 'active']), lt(identityAccessGrants.startsAt, input.expiresAt), gt(identityAccessGrants.expiresAt, input.startsAt)),
      with: { menus: true },
    }),
    executor.query.identityAccessRequests.findMany({
      where: buildWhere(eq(identityAccessRequests.targetUserId, input.targetUserId), exactTenantCondition(identityAccessRequests.tenantId, input.tenantId),
        input.excludeRequestId ? ne(identityAccessRequests.id, input.excludeRequestId) : undefined,
        or(eq(identityAccessRequests.status, 'pending'), and(eq(identityAccessRequests.status, 'approved'), inArray(identityAccessRequests.provisionStatus, ['pending', 'running']))),
        lt(identityAccessRequests.startsAt, input.expiresAt), gt(identityAccessRequests.expiresAt, input.startsAt)),
      with: { items: true },
    }),
  ]);
  const conflicts = new Set<string>();
  for (const wanted of requested) {
    if (grants.some(grant => grant.menus.some(item => item.id !== input.excludeGrantItemId && ['active', 'scheduled'].includes(item.status) && item.startsAt < input.expiresAt && item.expiresAt > input.startsAt && item.permissionCode === wanted.permissionCode && accessScopesOverlap(wanted, item)))
      || requests.some(request => request.items.some(item => item.permissionCode === wanted.permissionCode && accessScopesOverlap(wanted, item)))) conflicts.add(wanted.permissionLabel || wanted.permissionCode);
  }
  if (conflicts.size) throw new HTTPException(409, { message: `以下权限已有有效授权或待处理申请，请勿重复申请：${[...conflicts].join('、')}` });
}
