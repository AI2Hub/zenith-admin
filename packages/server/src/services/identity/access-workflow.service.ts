import { and, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { ACCESS_REQUEST_BIZ_TYPE } from '@zenith/shared/identity';
import type { DbExecutor } from '../../db/types';
import { identityAccessRequestItems, identityAccessRequests, workflowInstances } from '../../db/schema';
import { exactTenantCondition } from '../../lib/tenant';
import { parseDateTimeInput } from '../../lib/datetime';
import { enqueueJob } from '../../lib/workflow-jobs/engine';
import { assertNoOverlappingAccessRequest, type normalizeAccessWorkflowFormData } from './access-governance.service';

type NormalizedAccessForm = Awaited<ReturnType<typeof normalizeAccessWorkflowFormData>>;
type InstanceIdentity = Pick<typeof workflowInstances.$inferSelect, 'id' | 'tenantId' | 'initiatorId' | 'formData'>;

/** 仅接收已由权限域归一化的表单，与流程和权限预约共用提交事务。 */
export async function attachAccessRequestToWorkflow(executor: DbExecutor, instance: InstanceIdentity): Promise<void> {
  const form = instance.formData as NormalizedAccessForm;
  if (!Array.isArray(form?.permissionItems) || form.permissionItems.length === 0 || form.targetUserId !== instance.initiatorId) {
    throw new HTTPException(409, { message: '权限申请缺少有效的服务端审批快照' });
  }
  const startsAt = parseDateTimeInput(form.startsAt);
  const expiresAt = parseDateTimeInput(form.expiresAt);
  if (!startsAt || !expiresAt) throw new HTTPException(400, { message: '权限申请有效期无效' });
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`identity-access:${instance.tenantId ?? 'platform'}:${instance.initiatorId}`}, 0))`);
  const existing = await executor.query.identityAccessRequests.findFirst({
    where: and(eq(identityAccessRequests.workflowInstanceId, instance.id), exactTenantCondition(identityAccessRequests.tenantId, instance.tenantId)),
    columns: { id: true },
  });
  if (existing) throw new HTTPException(409, { message: '该权限申请已提交，请重新发起新的申请' });
  await assertNoOverlappingAccessRequest({ targetUserId: instance.initiatorId, tenantId: instance.tenantId, startsAt, expiresAt, items: form.permissionItems }, executor);
  const [request] = await executor.insert(identityAccessRequests).values({
    tenantId: instance.tenantId,
    applicantUserId: instance.initiatorId,
    targetUserId: instance.initiatorId,
    requestType: form.requestType,
    status: 'pending',
    reason: form.reason,
    businessReference: form.businessReference ?? null,
    startsAt,
    expiresAt,
    riskLevel: form.riskLevel,
    policySnapshot: form.policySnapshot,
    approvalPlan: form.approvalPlan,
    workflowInstanceId: instance.id,
  }).returning({ id: identityAccessRequests.id });
  await executor.insert(identityAccessRequestItems).values(form.permissionItems.map((item) => ({ requestId: request.id, ...item })));
  await executor.update(workflowInstances).set({ bizType: ACCESS_REQUEST_BIZ_TYPE, bizId: String(request.id) }).where(and(eq(workflowInstances.id, instance.id), exactTenantCondition(workflowInstances.tenantId, instance.tenantId)));
}

export async function bridgeAccessWorkflowOutcome(
  executor: DbExecutor,
  instance: { id: number; tenantId: number | null; bizType?: string | null; bizId?: string | null; status: string },
  actorId: number | null,
): Promise<void> {
  if (instance.bizType !== ACCESS_REQUEST_BIZ_TYPE) return;
  const requestId = Number(instance.bizId);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error('权限流程缺少业务申请关联');
  const where = and(eq(identityAccessRequests.id, requestId), eq(identityAccessRequests.workflowInstanceId, instance.id), exactTenantCondition(identityAccessRequests.tenantId, instance.tenantId));
  const [request] = await executor.select({ status: identityAccessRequests.status, approvedAt: identityAccessRequests.approvedAt }).from(identityAccessRequests).where(where).for('update').limit(1);
  if (!request) throw new Error('权限流程关联的申请不存在');
  if (instance.status === 'approved' && ['pending', 'approved'].includes(request.status)) {
    if (request.status === 'pending') await executor.update(identityAccessRequests).set({ status: 'approved', approvedAt: request.approvedAt ?? new Date(), failureReason: null }).where(where);
    await enqueueJob({
      jobType: 'access_grant_apply',
      instanceId: instance.id,
      tenantId: instance.tenantId,
      payload: { requestId, approvedBy: actorId },
      idempotencyKey: `identity-access-apply:${requestId}`,
      maxAttempts: 5,
    }, executor);
  } else if (['rejected', 'withdrawn', 'cancelled'].includes(instance.status)) {
    await executor.update(identityAccessRequests).set({
      status: instance.status === 'rejected' ? 'rejected' : 'cancelled',
      ...(instance.status === 'rejected' ? { rejectedAt: new Date() } : {}),
    }).where(and(where, inArray(identityAccessRequests.status, ['pending'])));
  }
}
