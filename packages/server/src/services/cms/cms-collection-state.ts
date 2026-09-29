import { eq, sql } from 'drizzle-orm';
import { cmsStatisticsCoverage } from '@zenith/shared/cms';
import type { DbExecutor, DbTransaction } from '../../db/types';
import { cmsCollectionStates, cmsCollectionTransitions } from '../../db/schema';
import { cmsGenerationSchemaName } from './cms-generation-storage.service';

export async function readCmsCollectionState(tx: DbExecutor, siteId: number) {
  const [current] = await tx.execute<{ settings: Record<string, unknown>; generationId: number | null; status: string }>(sql`
    select s.settings,s.status,g.active_generation_id as "generationId" from public.cms_sites s
    left join public.cms_site_generations g on g.site_id=s.id where s.id=${siteId}`);
  let published: Record<string, unknown> = {};
  if (current?.generationId) {
    const schema = sql.identifier(cmsGenerationSchemaName(current.generationId));
    const [row] = await tx.execute<{ settings: Record<string, unknown> }>(sql`select settings from ${schema}.cms_site_projection where id=${siteId}`);
    published = row?.settings ?? {};
  }
  const configured = current?.settings?.telemetry as { enabled?: boolean; schemaVersion?: number } | undefined;
  const active = published.telemetry as { enabled?: boolean; schemaVersion?: number } | undefined;
  const configuredEnabled = current?.status === 'enabled' && configured?.enabled === true && configured.schemaVersion === 2;
  const publishedEnabled = active?.enabled === true && active.schemaVersion === 2;
  return { configured: configuredEnabled, published: publishedEnabled, enabled: configuredEnabled && publishedEnabled,
    generationId: current?.generationId ?? null, changed: JSON.stringify(configured ?? {}) !== JSON.stringify(active ?? {}) };
}

/** Caller-owned transaction serializes the small coverage state with publication/configuration changes. */
export async function syncCmsCollectionState(tx: DbTransaction, siteId: number, reason: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(193119,${siteId})`);
  const state = await readCmsCollectionState(tx, siteId);
  const [previous] = await tx.select().from(cmsCollectionStates).where(eq(cmsCollectionStates.siteId, siteId)).limit(1);
  if (!previous) await tx.insert(cmsCollectionStates).values({ siteId, enabled: state.enabled });
  else if (previous.enabled === state.enabled) return state;
  else await tx.update(cmsCollectionStates).set({ enabled: state.enabled }).where(eq(cmsCollectionStates.siteId, siteId));
  await tx.insert(cmsCollectionTransitions).values({ siteId, enabled: state.enabled, deploymentId: state.generationId, reason });
  return state;
}

/** First observation starts an honest coverage interval; it never backfills historical availability. */
export async function observeCmsCollectionState(tx: DbTransaction, siteId: number) {
  const [known] = await tx.select({ siteId: cmsCollectionStates.siteId }).from(cmsCollectionStates).where(eq(cmsCollectionStates.siteId, siteId)).limit(1);
  if (!known) await syncCmsCollectionState(tx, siteId, 'observed');
}

export async function getCmsCollectionCoverage(tx: DbTransaction, siteId: number, start: string, end: string, firstEventAt: string | null) {
  const [state] = await tx.select().from(cmsCollectionStates).where(eq(cmsCollectionStates.siteId, siteId)).limit(1);
  const changes = await tx.select({ enabled: cmsCollectionTransitions.enabled, at: cmsCollectionTransitions.createdAt }).from(cmsCollectionTransitions)
    .where(eq(cmsCollectionTransitions.siteId, siteId)).orderBy(cmsCollectionTransitions.createdAt, cmsCollectionTransitions.id);
  return cmsStatisticsCoverage({ start, end, firstEventAt, knownSince: state?.knownSince.toISOString() ?? null,
    purgedThrough: state?.purgedThrough?.toISOString() ?? null, changes: changes.map(change => ({ enabled: change.enabled, at: change.at.toISOString() })) });
}
