import { eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../db';
import type { DbExecutor, DbTransaction } from '../../db/types';
import { cmsDeploymentStorage, cmsSiteGenerations } from '../../db/schema';

export class CmsGenerationReadUnavailable extends HTTPException {
  constructor() { super(409, { message: '部署存储正在切换或已经回收，请刷新后重试' }); }
}

/** Paired with the exclusive generation lock used by the builder and storage reclaimer. */
export async function pinCmsGenerationRead(tx: DbTransaction, generationId: number): Promise<void> {
  if (!Number.isSafeInteger(generationId) || generationId <= 0) throw new CmsGenerationReadUnavailable();
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext('cms-generation-build'),${generationId})`);
  // Catalog lookup observes a committed DROP even when this transaction's business-data snapshot
  // predates it. Never let search_path silently fall back to uncommitted public working tables.
  const [catalog] = await tx.execute<{ present: string | null }>(sql`select to_regclass(${`cms_generation_${generationId}.cms_site_projection`})::text as present`);
  const [storage] = await tx.select({ state: cmsDeploymentStorage.storageState }).from(cmsDeploymentStorage).where(eq(cmsDeploymentStorage.deploymentId, generationId)).limit(1);
  if (!catalog?.present || (storage && storage.state !== 'available')) throw new CmsGenerationReadUnavailable();
}

/** Retry the entire snapshot when a previously selected public generation has just been reclaimed. */
export async function readCmsGenerationSnapshot<T>(siteId: number, fn: (tx: DbTransaction, generationId: number | null) => Promise<T>, executor: DbExecutor = db): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await executor.transaction(async tx => {
        const [pointer] = await tx.select({ id: cmsSiteGenerations.activeGenerationId }).from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, siteId)).limit(1);
        const generationId = pointer?.id ?? null;
        if (generationId) await pinCmsGenerationRead(tx, generationId);
        return fn(tx, generationId);
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    } catch (error) {
      if (!(error instanceof CmsGenerationReadUnavailable) || attempt >= 2) throw error;
    }
  }
}
