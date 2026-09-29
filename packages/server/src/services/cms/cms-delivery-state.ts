import { eq, sql } from 'drizzle-orm';
import { cmsDeliveryStates } from '../../db/schema/cms-delivery';
import type { DbExecutor } from '../../db/types';

export async function readCmsVisibilityEpoch(executor: DbExecutor, siteId: number): Promise<number> {
  const [row] = await executor.select({ epoch: cmsDeliveryStates.visibilityEpoch }).from(cmsDeliveryStates).where(eq(cmsDeliveryStates.siteId, siteId)).limit(1);
  return row?.epoch ?? 0;
}

/** Caller owns the site publish lock; this write shares the mutation transaction. */
export async function bumpCmsVisibilityEpoch(executor: DbExecutor, siteId: number): Promise<number> {
  const [row] = await executor.insert(cmsDeliveryStates).values({ siteId, visibilityEpoch: 1 }).onConflictDoUpdate({
    target: cmsDeliveryStates.siteId,
    set: { visibilityEpoch: sql`${cmsDeliveryStates.visibilityEpoch} + 1`, updatedAt: new Date() },
  }).returning({ epoch: cmsDeliveryStates.visibilityEpoch });
  return row.epoch;
}
