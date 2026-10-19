import { and, eq, inArray } from 'drizzle-orm';
import { identityAccessRequests } from '../../../db/schema';
import { exactTenantCondition } from '../../tenant';
import { applyApprovedAccessRequest } from '../../../services/identity/access-governance.service';
import { registerJobHandler } from '../registry';
import { workflowTransaction } from '../lease';
import { WorkflowJobPermanentError } from '../errors';

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
    await workflowTransaction(async (tx) => {
      await tx.update(identityAccessRequests).set({ status: 'failed', failureReason: error instanceof Error ? error.message.slice(0, 1000) : '权限授权发放失败' })
        .where(and(eq(identityAccessRequests.id, requestId), eq(identityAccessRequests.workflowInstanceId, workflowInstanceId), exactTenantCondition(identityAccessRequests.tenantId, job.tenantId), inArray(identityAccessRequests.status, ['approved', 'failed'])));
    });
    throw error;
  }
});
