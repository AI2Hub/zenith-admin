import { desc, eq } from 'drizzle-orm';
import type { CmsContentReviewIssue, CmsEditorialGoal } from '@zenith/shared/cms';
import type { DbTransaction } from '../../db/types';
import { cmsDeployments, cmsEditorialTasks, cmsEditorialTaskRounds, cmsReleaseActivations } from '../../db/schema';
import { buildWhere } from '../../lib/where-helpers';
import { loadCmsPublishableRevision } from './cms-content-revisions.service';
import { appendCmsEditorialTaskHistory, lockCmsEditorialRound } from './cms-editorial-outcomes-shared';
import { isCmsRevisionAssetVisible } from './cms-asset-rights.service';

/** Called under the site's publication lock and the policy lock, in the manual review transaction. */
export async function confirmCmsPeriodicReviewTasks(tx: DbTransaction, input: {
  siteId: number; contentId: number; revisionId: number; generationId: number; recordId: number; note: string; issues: CmsContentReviewIssue[];
}): Promise<number[]> {
  const ids = [...new Set(input.issues.filter(issue => issue.kind === 'review_due' && issue.taskId).map(issue => issue.taskId!))].sort((a, b) => a - b);
  if (!ids.length) return [];
  const revision = await loadCmsPublishableRevision(tx, input.revisionId);
  if (revision.contentId !== input.contentId || revision.siteId !== input.siteId || !await isCmsRevisionAssetVisible(revision.snapshot, tx)) return [];
  const [deployment] = await tx.select().from(cmsDeployments).where(buildWhere(eq(cmsDeployments.id, input.generationId), eq(cmsDeployments.siteId, input.siteId))).limit(1);
  if (!deployment?.snapshot?.revisions.some(entry => entry.contentId === input.contentId && entry.revisionId === revision.id && entry.hash === revision.hash)) return [];
  const [activation] = await tx.select().from(cmsReleaseActivations).where(buildWhere(eq(cmsReleaseActivations.siteId, input.siteId), eq(cmsReleaseActivations.toGenerationId, input.generationId))).orderBy(desc(cmsReleaseActivations.id)).limit(1);
  if (!activation) return [];
  const confirmed: number[] = [];
  for (const taskId of ids) {
    const [task] = await tx.select().from(cmsEditorialTasks).where(buildWhere(eq(cmsEditorialTasks.id, taskId), eq(cmsEditorialTasks.siteId, input.siteId), eq(cmsEditorialTasks.contentId, input.contentId), eq(cmsEditorialTasks.source, 'review'))).for('update').limit(1);
    if (!task) continue;
    const round = await lockCmsEditorialRound(tx, task);
    if (!round || round.closedAt || round.interruptedAt || round.sourceEvidence.metadata.reviewKind !== 'review_due'
      || (round.goal && round.goal.metric !== 'manual') || (round.solutionRevisionId && round.solutionRevisionId !== revision.id)) continue;
    if (task.status === 'verified') { confirmed.push(task.id); continue; }
    if (!['open', 'in_progress', 'edit_done', 'online', 'observing'].includes(task.status)) continue;
    const goal: CmsEditorialGoal = { metric: 'manual', targetValue: 0, minSample: 30, description: '核实当前在线修订的准确性并记录人工复核结论' };
    await tx.update(cmsEditorialTaskRounds).set({ solutionRevisionId: revision.id, solutionHash: revision.hash, goal,
      releaseId: deployment.releaseId, deploymentId: deployment.id, activationId: activation.id, activatedAt: activation.createdAt, verifiedAt: new Date(),
    }).where(eq(cmsEditorialTaskRounds.id, round.id));
    const [updated] = await tx.update(cmsEditorialTasks).set({ status: 'verified', version: task.version + 1 }).where(eq(cmsEditorialTasks.id, task.id)).returning();
    await appendCmsEditorialTaskHistory(tx, updated, 'review_confirmed', input.note, { reviewRecordId: input.recordId, revisionId: revision.id, revisionHash: revision.hash, deploymentId: deployment.id, activationId: activation.id, verification: '定期人工复核完成，不推断访问或转化指标改善' });
    confirmed.push(task.id);
  }
  return confirmed;
}
