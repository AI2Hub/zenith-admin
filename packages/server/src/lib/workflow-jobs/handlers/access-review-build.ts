import { and, eq, inArray } from 'drizzle-orm';
import { identityAccessReviewCampaigns } from '../../../db/schema';
import { exactTenantCondition } from '../../tenant';
import { buildAccessReviewCampaign } from '../../../services/identity/access-review.service';
import { registerJobHandler, registerJobSettlementHandler } from '../registry';
import { WorkflowJobPermanentError } from '../errors';

registerJobHandler('access_review_build', async ({ payload, job }) => {
  const campaignId = payload.campaignId;
  if (typeof campaignId !== 'number' || !Number.isSafeInteger(campaignId) || campaignId <= 0) throw new WorkflowJobPermanentError('复核准备作业缺少有效批次关联');
  await buildAccessReviewCampaign(campaignId, job.tenantId);
  return { result: { campaignId } };
});

registerJobSettlementHandler('access_review_build', async (tx, job) => {
  const payload = job.payload as { campaignId?: unknown } | null;
  if (typeof payload?.campaignId !== 'number' || !['pending', 'failed', 'dead', 'canceled'].includes(job.status)) return;
  await tx.update(identityAccessReviewCampaigns).set({ status: job.status === 'pending' ? 'preparing' : 'failed', failureReason: job.lastError ?? (job.status === 'canceled' ? '复核准备作业已取消，可重试继续准备' : '复核准备失败') })
    .where(and(eq(identityAccessReviewCampaigns.id, payload.campaignId), exactTenantCondition(identityAccessReviewCampaigns.tenantId, job.tenantId), inArray(identityAccessReviewCampaigns.status, ['preparing', 'failed'])));
}, { includeCanceled: true });
