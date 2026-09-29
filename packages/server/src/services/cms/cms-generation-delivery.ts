import { and, eq } from 'drizzle-orm';
import { cmsDeployments } from '../../db/schema/cms-releases';
import type { DbExecutor } from '../../db/types';
import { requireRow } from '../../lib/db-assert';
import { readCmsVisibilityEpoch } from './cms-delivery-state';

/** The caller owns the snapshot and any generation lock; never open another transaction here. */
export async function readCmsGenerationDelivery(executor: DbExecutor, siteId: number, generationId: number, candidate: boolean) {
  const [row] = await executor.select({ releaseId: cmsDeployments.releaseId, visibilityEpoch: cmsDeployments.visibilityEpoch })
    .from(cmsDeployments).where(and(eq(cmsDeployments.id, generationId), eq(cmsDeployments.siteId, siteId))).limit(1);
  const deployment = requireRow(row, '公开部署不存在');
  return { releaseId: deployment.releaseId, capturedVisibilityEpoch: deployment.visibilityEpoch,
    visibilityEpoch: candidate ? deployment.visibilityEpoch : await readCmsVisibilityEpoch(executor, siteId) };
}
