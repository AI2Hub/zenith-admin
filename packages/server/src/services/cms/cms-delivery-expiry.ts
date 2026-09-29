import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { cmsAssetRights, cmsContents, cmsDeliveryExpiryReceipts, cmsDeliveryRuns, cmsResources } from '../../db/schema';
import { enqueueAsyncTask } from '../../lib/task-center';
import { acquireCmsSitePublishLock } from './cms-site-publish-lock.service';
import { bumpCmsVisibilityEpoch } from './cms-delivery-state';
import { cmsDeliveryContentPaths, cmsDeliveryRightsPaths, insertCmsDeliveryRun } from './cms-delivery-records';
import { invalidateCmsSiteCaches } from './cms-cache.service';

/** Natural expiry is a visibility mutation even if no administrator presses Save. */
export async function scheduleCmsExpiredDelivery(now = new Date()): Promise<number> {
  const expiredAssets = await db.select({ resourceId: cmsAssetRights.resourceId, siteId: cmsResources.siteId }).from(cmsAssetRights)
    .innerJoin(cmsResources, eq(cmsResources.id, cmsAssetRights.resourceId))
    .leftJoin(cmsDeliveryExpiryReceipts, eq(cmsDeliveryExpiryReceipts.resourceId, cmsAssetRights.resourceId))
    .where(and(isNotNull(cmsAssetRights.expiresAt), lte(cmsAssetRights.expiresAt, now), sql`${cmsDeliveryExpiryReceipts.expiresAt} is distinct from ${cmsAssetRights.expiresAt}`)).orderBy(cmsAssetRights.resourceId).limit(200);
  let scheduled = 0;
  for (const siteId of [...new Set(expiredAssets.map(item => item.siteId))].sort((a, b) => a - b)) {
    const resources = expiredAssets.filter(item => item.siteId === siteId).map(item => item.resourceId);
    const delivery = await db.transaction(async tx => {
      await acquireCmsSitePublishLock(tx, siteId);
      const rows = await tx.select({ id: cmsAssetRights.resourceId, expiresAt: cmsAssetRights.expiresAt }).from(cmsAssetRights)
        .innerJoin(cmsResources, eq(cmsResources.id, cmsAssetRights.resourceId))
        .leftJoin(cmsDeliveryExpiryReceipts, eq(cmsDeliveryExpiryReceipts.resourceId, cmsAssetRights.resourceId))
        .where(and(eq(cmsResources.siteId, siteId), inArray(cmsAssetRights.resourceId, resources), isNotNull(cmsAssetRights.expiresAt), lte(cmsAssetRights.expiresAt, now), sql`${cmsDeliveryExpiryReceipts.expiresAt} is distinct from ${cmsAssetRights.expiresAt}`));
      if (!rows.length) return null;
      for (const row of rows) await tx.insert(cmsDeliveryExpiryReceipts).values({ resourceId: row.id, expiresAt: row.expiresAt! }).onConflictDoUpdate({
        target: cmsDeliveryExpiryReceipts.resourceId, set: { expiresAt: row.expiresAt!, updatedAt: new Date() },
      });
      const epoch = await bumpCmsVisibilityEpoch(tx, siteId);
      return insertCmsDeliveryRun(tx, siteId, { eventKey: `asset-expiry:${epoch}`, cause: 'expiry', paths: await cmsDeliveryRightsPaths(tx, siteId, rows.map(row => row.id), true) });
    });
    if (delivery) {
      await invalidateCmsSiteCaches(siteId);
      await enqueueAsyncTask(delivery.taskId).catch(() => undefined);
      scheduled++;
    }
  }
  // Content can become invisible at its deadline even when editing locks/widget dependencies block the offline transition.
  const contents = await db.select({ id: cmsContents.id, siteId: cmsContents.siteId, expiresAt: cmsContents.expireAt }).from(cmsContents).where(and(
    eq(cmsContents.status, 'published'), isNotNull(cmsContents.expireAt), lte(cmsContents.expireAt, now),
    sql`not exists(select 1 from ${cmsDeliveryRuns} where ${cmsDeliveryRuns.siteId}=${cmsContents.siteId} and ${cmsDeliveryRuns.eventKey}='content-expiry:' || ${cmsContents.id}::text || ':' || ${cmsContents.expireAt}::text)`,
  )).orderBy(cmsContents.id).limit(200);
  for (const content of contents) {
    const delivery = await db.transaction(async tx => {
      await acquireCmsSitePublishLock(tx, content.siteId);
      const [current] = await tx.select({ id: cmsContents.id, eventKey: sql<string>`'content-expiry:' || ${cmsContents.id}::text || ':' || ${cmsContents.expireAt}::text` }).from(cmsContents).where(and(
        eq(cmsContents.id, content.id), eq(cmsContents.siteId, content.siteId), eq(cmsContents.status, 'published'), lte(cmsContents.expireAt, now),
      )).limit(1);
      if (!current) return null;
      const [seen] = await tx.select({ id: cmsDeliveryRuns.id }).from(cmsDeliveryRuns).where(and(eq(cmsDeliveryRuns.siteId, content.siteId), eq(cmsDeliveryRuns.eventKey, current.eventKey))).limit(1);
      if (seen) return null;
      await bumpCmsVisibilityEpoch(tx, content.siteId);
      return insertCmsDeliveryRun(tx, content.siteId, { eventKey: current.eventKey, cause: 'expiry', paths: await cmsDeliveryContentPaths(tx, content.siteId, [content.id], 'withdrawn') });
    });
    if (delivery) {
      await invalidateCmsSiteCaches(content.siteId);
      await enqueueAsyncTask(delivery.taskId).catch(() => undefined);
      scheduled++;
    }
  }
  return scheduled;
}
