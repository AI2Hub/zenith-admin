import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { cmsDeliveryPathSchema, cmsDeliveryConfigValuesSchema, type CmsChannelDetailPathRule, type CmsDeliveryPathExpectation, type CmsDeliveryRun } from '@zenith/shared/cms';
import { config } from '../../config';
import type { DbExecutor, DbTransaction } from '../../db/types';
import { cmsAssetVersions, cmsDeliveryRuns, cmsDeliveryStates, cmsDeployments, cmsReleaseActivations, cmsSiteGenerations, cmsSites } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import { persistAsyncTask } from '../../lib/task-center';
import { readCmsVisibilityEpoch } from './cms-delivery-state';
import { contentUrl } from './cms-urls';

export const CMS_DELIVERY_TASK = 'cms-delivery-check';

export function cmsEffectiveDeliverySourceUrl(siteCode: string, configured: string | null): string | null {
  return configured ?? (config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/+$/u, '')}/__cms/${encodeURIComponent(siteCode)}` : null);
}

export function cmsDeliveryConfiguration(settings: Record<string, unknown> | null) {
  const parsed = cmsDeliveryConfigValuesSchema.safeParse(settings?.delivery);
  const version = settings?.delivery && typeof settings.delivery === 'object' && 'version' in settings.delivery ? Number(settings.delivery.version) : 0;
  return parsed.success ? { ...parsed.data, version: Number.isSafeInteger(version) && version >= 0 ? version : 0 } : { sourceBaseUrl: null, publicBaseUrl: null, paths: ['/'], version: 0 };
}

export async function cmsCurrentDeliveryIdentity(executor: DbExecutor, siteId: number) {
  const [pointer] = await executor.select({ generationId: cmsSiteGenerations.activeGenerationId }).from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, siteId)).limit(1);
  const generationId = pointer?.generationId ?? null;
  const [deployment] = generationId ? await executor.select({ releaseId: cmsDeployments.releaseId }).from(cmsDeployments).where(and(eq(cmsDeployments.id, generationId), eq(cmsDeployments.siteId, siteId))).limit(1) : [];
  const [activation] = generationId ? await executor.select({ id: cmsReleaseActivations.id }).from(cmsReleaseActivations).where(and(eq(cmsReleaseActivations.siteId, siteId), eq(cmsReleaseActivations.toGenerationId, generationId))).orderBy(desc(cmsReleaseActivations.id)).limit(1) : [];
  return { generationId, releaseId: deployment?.releaseId ?? null, activationId: activation?.id ?? null, visibilityEpoch: await readCmsVisibilityEpoch(executor, siteId) };
}

/** Minimal current-path projection, shared by publish, withdrawal and rights changes. */
export async function cmsDeliveryContentPaths(executor: DbExecutor, siteId: number, ids: number[], expectedStatus: CmsDeliveryPathExpectation['expectedStatus']): Promise<CmsDeliveryPathExpectation[]> {
  if (!ids.length) return [];
  const [pointer] = await executor.select({ id: cmsSiteGenerations.activeGenerationId }).from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, siteId)).limit(1);
  if (!pointer?.id || !Number.isSafeInteger(pointer.id) || pointer.id <= 0) return [];
  const schema = `"cms_generation_${pointer.id}"`;
  const rows = await executor.execute<{ id: number; slug: string | null; staticPath: string | null; publishedAt: string | null; createdAt: string | null; channelPath: string; detailPathRule: CmsChannelDetailPathRule }>(sql`
    select p.id,p.slug,p.static_path as "staticPath",p.published_at as "publishedAt",p.created_at as "createdAt",c.path as "channelPath",c.detail_path_rule as "detailPathRule"
    from ${sql.raw(schema)}.cms_content_projection p join ${sql.raw(schema)}.cms_channels c on c.id=p.channel_id
    where p.site_id=${siteId} and ${inArray(sql`p.id`, ids)}
  `);
  return rows.map(row => ({ path: contentUrl('', { path: row.channelPath, detailPathRule: row.detailPathRule }, { ...row, publishedAt: row.publishedAt ? new Date(row.publishedAt) : null, createdAt: row.createdAt ? new Date(row.createdAt) : null }), expectedStatus }));
}

export async function cmsDeliveryRightsPaths(executor: DbExecutor, siteId: number, resourceIds: number[], withdrawn: boolean): Promise<CmsDeliveryPathExpectation[]> {
  if (!resourceIds.length) return [];
  // The sealed public projection checks pinned asset versions, not merely the latest editable media.
  const rows = await executor.execute<{ id: number }>(sql`
    select distinct c.id from public.cms_contents c
    join public.cms_content_working_copies w on w.content_id=c.id
    join public.cms_content_revisions r on r.id=w.published_revision_id
    where c.site_id=${siteId} and c.status='published'
      and exists (select 1 from jsonb_object_keys(coalesce(r.snapshot->'assetVersions','{}'::jsonb)) as asset(id) where ${inArray(sql`asset.id`, resourceIds.map(String))})
    limit 50
  `);
  const paths = await cmsDeliveryContentPaths(executor, siteId, rows.map(row => row.id), withdrawn ? 'withdrawn' : 'visible');
  if (withdrawn) {
    const assets = await executor.select({ id: cmsAssetVersions.id, url: cmsAssetVersions.url, resourceId: cmsAssetVersions.resourceId }).from(cmsAssetVersions).where(and(eq(cmsAssetVersions.siteId, siteId), inArray(cmsAssetVersions.resourceId, resourceIds))).orderBy(desc(cmsAssetVersions.id)).limit(50);
    paths.push(...assets.map(asset => ({ path: `/asset-version/${asset.id}`, expectedStatus: 'withdrawn' as const, kind: 'asset' as const, assetUrl: asset.url })));
  }
  return paths;
}

/** Caller has the site publish lock. Both the business mutation and delivery identity commit together. */
export async function insertCmsDeliveryRun(tx: DbTransaction, siteId: number, input: {
  eventKey: string; cause: CmsDeliveryRun['cause']; paths?: CmsDeliveryPathExpectation[];
}) {
  const [existing] = await tx.select({ id: cmsDeliveryRuns.id, taskId: cmsDeliveryRuns.taskId }).from(cmsDeliveryRuns).where(and(eq(cmsDeliveryRuns.siteId, siteId), eq(cmsDeliveryRuns.eventKey, input.eventKey))).limit(1);
  if (existing?.taskId) return { id: existing.id, taskId: existing.taskId };
  const [site] = await tx.select({ settings: cmsSites.settings, code: cmsSites.code }).from(cmsSites).where(eq(cmsSites.id, siteId)).limit(1);
  requireRow(site, '站点不存在');
  const identity = await cmsCurrentDeliveryIdentity(tx, siteId);
  const delivery = cmsDeliveryConfiguration(site.settings);
  const expected = new Map<string, CmsDeliveryPathExpectation>();
  for (const item of [...(input.paths ?? []), ...delivery.paths.map(path => ({ path, expectedStatus: 'visible' as const }))]) {
    const parsed = cmsDeliveryPathSchema.safeParse(item.path.startsWith('/') ? item.path : `/${item.path}`);
    if (!parsed.success) continue;
    const previous = expected.get(parsed.data);
    if (!previous || item.expectedStatus === 'withdrawn') expected.set(parsed.data, { ...item, path: parsed.data });
  }
  if (!expected.has('/')) expected.set('/', { path: '/', expectedStatus: 'visible' });
  const paths = [...expected.values()].sort((a, b) => Number(b.expectedStatus === 'withdrawn') - Number(a.expectedStatus === 'withdrawn')).slice(0, 50);
  const [run] = await tx.insert(cmsDeliveryRuns).values({ siteId, ...identity, eventKey: input.eventKey, cause: input.cause,
    sourceBaseUrl: cmsEffectiveDeliverySourceUrl(site.code, delivery.sourceBaseUrl), publicBaseUrl: delivery.publicBaseUrl, sourceHost: null,
    paths, configVersion: delivery.version,
  }).returning({ id: cmsDeliveryRuns.id });
  await tx.update(cmsDeliveryRuns).set({ status: 'superseded', error: '已被新的公开版本或验证请求替代', completedAt: new Date() }).where(and(eq(cmsDeliveryRuns.siteId, siteId), ne(cmsDeliveryRuns.id, run.id), inArray(cmsDeliveryRuns.status, ['activated', 'cache_refreshing', 'checking'])));
  await tx.insert(cmsDeliveryStates).values({ siteId, visibilityEpoch: identity.visibilityEpoch, latestRunId: run.id }).onConflictDoUpdate({ target: cmsDeliveryStates.siteId, set: { latestRunId: run.id, updatedAt: new Date() } });
  const task = await persistAsyncTask(tx, { taskType: CMS_DELIVERY_TASK, title: `CMS 交付验证 #${run.id}`, tenantId: null, payload: { deliveryRunId: run.id, siteId }, idempotencyKey: `cms-delivery:${run.id}` });
  await tx.update(cmsDeliveryRuns).set({ taskId: task.id }).where(eq(cmsDeliveryRuns.id, run.id));
  return { id: run.id, taskId: task.id };
}
