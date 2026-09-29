import { randomUUID } from 'node:crypto';
import { and, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type * as z from 'zod';
import { HTTPException } from 'hono/http-exception';
import { cmsDeliveryContract, cmsDeliveryRunSchema, cmsDeliveryRunSummarySchema, type saveCmsDeliveryConfigSchema } from '@zenith/shared/cms';
import type { QueryOutputOf } from '@zenith/shared/core';
import { db } from '../../db';
import { config } from '../../config';
import { cmsDeliveryRuns, cmsDeliveryStates, cmsSites } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import { pickEntity } from '../../lib/entity-map';
import { buildWhere, withPagination } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { enqueueAsyncTask } from '../../lib/task-center';
import { assertSafeOutboundUrl } from '../../lib/outbound-url';
import { assertAllCmsSiteChannelsAccess } from './cms-channels.service';
import { lockCmsSiteForMutation } from './cms-site-publish-lock.service';
import { cmsCurrentDeliveryIdentity, cmsDeliveryConfiguration, cmsEffectiveDeliverySourceUrl, insertCmsDeliveryRun } from './cms-delivery-records';

export function cmsDeliverySourceAllowlist(rawUrl: string | null): string[] {
  if (!rawUrl) return [];
  try { const trusted = new URL(config.publicBaseUrl); return new URL(rawUrl).origin === trusted.origin ? [trusted.hostname.replace(/^\[|\]$/gu, '')] : []; } catch { return []; }
}

export async function getCmsDeliveryConfig(siteId: number) {
  await assertAllCmsSiteChannelsAccess(siteId);
  const [site] = await db.select({ settings: cmsSites.settings, code: cmsSites.code }).from(cmsSites).where(eq(cmsSites.id, siteId)).limit(1);
  requireRow(site, '站点不存在');
  const delivery = cmsDeliveryConfiguration(site.settings);
  return { ...delivery, siteId, effectiveSourceBaseUrl: cmsEffectiveDeliverySourceUrl(site.code, delivery.sourceBaseUrl) };
}

export async function saveCmsDeliveryConfig(siteId: number, input: z.output<typeof saveCmsDeliveryConfigSchema>) {
  await assertAllCmsSiteChannelsAccess(siteId);
  // Configuration is user editable. Only the deployment's trusted API origin can use private source HTTP.
  if (input.sourceBaseUrl) await assertSafeOutboundUrl(input.sourceBaseUrl, cmsDeliverySourceAllowlist(input.sourceBaseUrl));
  if (input.publicBaseUrl) await assertSafeOutboundUrl(input.publicBaseUrl);
  await db.transaction(async tx => {
    const site = await lockCmsSiteForMutation(tx, siteId);
    const current = cmsDeliveryConfiguration(site.settings);
    if (current.version !== input.expectedVersion) throw new HTTPException(409, { message: '交付入口已被其他编辑者修改，请刷新后重试' });
    const { expectedVersion: _expected, ...values } = input;
    await tx.update(cmsSites).set({ settings: { ...(site.settings ?? {}), delivery: { ...values, version: current.version + 1 } } }).where(eq(cmsSites.id, siteId));
    await tx.update(cmsDeliveryStates).set({ latestRunId: null }).where(eq(cmsDeliveryStates.siteId, siteId));
    await tx.update(cmsDeliveryRuns).set({ status: 'superseded', error: '交付入口配置已变化，请重新验证', completedAt: new Date() }).where(and(eq(cmsDeliveryRuns.siteId, siteId), inArray(cmsDeliveryRuns.status, ['activated', 'cache_refreshing', 'checking'])));
  });
  return getCmsDeliveryConfig(siteId);
}

export async function getCmsDeliveryRun(id: number) {
  const [row] = await db.select().from(cmsDeliveryRuns).where(eq(cmsDeliveryRuns.id, id)).limit(1);
  requireRow(row, '交付验证记录不存在');
  await assertAllCmsSiteChannelsAccess(row.siteId);
  return pickEntity(cmsDeliveryRunSchema, row);
}

export async function listCmsDeliveryRuns(query: QueryOutputOf<typeof cmsDeliveryContract.list>) {
  await assertAllCmsSiteChannelsAccess(query.siteId);
  const { paths: _paths, observations: _observations, ...columns } = getTableColumns(cmsDeliveryRuns);
  const where = buildWhere(eq(cmsDeliveryRuns.siteId, query.siteId), query.releaseId ? eq(cmsDeliveryRuns.releaseId, query.releaseId) : undefined);
  return buildListResult({ page: query.page, pageSize: query.pageSize,
    count: () => db.$count(cmsDeliveryRuns, where),
    rows: () => withPagination(db.select(columns).from(cmsDeliveryRuns).where(where).orderBy(desc(cmsDeliveryRuns.id)).$dynamic(), query.page, query.pageSize),
    map: row => pickEntity(cmsDeliveryRunSummarySchema, row) });
}

export async function startCmsDelivery(siteId: number, previousId?: number) {
  await assertAllCmsSiteChannelsAccess(siteId);
  const run = await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, siteId);
    let paths;
    if (previousId) {
      const [previous] = await tx.select().from(cmsDeliveryRuns).where(and(eq(cmsDeliveryRuns.id, previousId), eq(cmsDeliveryRuns.siteId, siteId))).limit(1);
      requireRow(previous, '交付验证记录不存在');
      const identity = await cmsCurrentDeliveryIdentity(tx, siteId);
      if (identity.generationId !== previous.generationId || identity.activationId !== previous.activationId || identity.visibilityEpoch !== previous.visibilityEpoch) {
        throw new HTTPException(409, { message: '此记录已不属于当前公开版本，请验证当前版本' });
      }
      paths = previous.paths;
    }
    return insertCmsDeliveryRun(tx, siteId, { eventKey: `manual:${randomUUID()}`, cause: 'manual', paths });
  });
  await enqueueAsyncTask(run.taskId).catch(() => undefined);
  return getCmsDeliveryRun(run.id);
}

export async function retryCmsDelivery(id: number) {
  const run = await getCmsDeliveryRun(id);
  return startCmsDelivery(run.siteId, id);
}
