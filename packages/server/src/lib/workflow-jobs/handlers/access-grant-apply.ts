import { and, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { identityAccessRequests } from '../../../db/schema';
import { exactTenantCondition } from '../../tenant';
import { applyApprovedAccessRequest } from '../../../services/identity/access-governance.service';
import { registerJobHandler, registerJobSettlementHandler } from '../registry';
import { workflowTransaction } from '../lease';
import { WorkflowJobPermanentError } from '../errors';

registerJobSettlementHandler('access_grant_apply', async (tx, job) => {
  const payload = job.payload as { requestId?: unknown } | null;
  if (typeof payload?.requestId !== 'number') return;
  if (!['pending', 'dead', 'failed', 'canceled'].includes(job.status)) return;
  await tx.update(identityAccessRequests).set({ provisionStatus: job.status === 'pending' ? 'pending' : job.status === 'canceled' ? 'terminated' : 'failed', failureReason: job.lastError ?? (job.status === 'canceled' ? '授权发放作业已被管理员取消' : null) })
    .where(and(eq(identityAccessRequests.id, payload.requestId), exactTenantCondition(identityAccessRequests.tenantId, job.tenantId), eq(identityAccessRequests.status, 'approved'), inArray(identityAccessRequests.provisionStatus, ['not_started', 'pending', 'running', 'failed'])));
}, { includeCanceled: true });

registerJobHandler('access_grant_apply', async ({ job, payload }) => {
  const requestId = payload.requestId;
  const workflowInstanceId = job.instanceId;
  if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0 || workflowInstanceId === null) {
    throw new WorkflowJobPermanentError('权限授权发放作业缺少有效申请关联');
  }
  try {
    const grant = await applyApprovedAccessRequest(requestId, {
      workflowInstanceId,
      tenantId: job.tenantId,
      approvedBy: typeof payload.approvedBy === 'number' ? payload.approvedBy : null,
    });
    return { result: { requestId, grantId: grant?.id ?? null } };
  } catch (error) {
    const permanent = error instanceof HTTPException && error.status >= 400 && error.status < 500;
    await workflowTransaction(async (tx) => {
      await tx.update(identityAccessRequests).set({ provisionStatus: permanent ? 'terminated' : 'failed', failureReason: error instanceof Error ? error.message.slice(0, 1000) : '权限授权发放失败' })
        .where(and(eq(identityAccessRequests.id, requestId), eq(identityAccessRequests.workflowInstanceId, workflowInstanceId), exactTenantCondition(identityAccessRequests.tenantId, job.tenantId), eq(identityAccessRequests.status, 'approved'), inArray(identityAccessRequests.provisionStatus, ['pending', 'running', 'failed'])));
    });
    if (permanent) throw new WorkflowJobPermanentError(error.message);
    throw error;
  }
});
