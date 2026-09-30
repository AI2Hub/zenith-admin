import { eq } from 'drizzle-orm';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { cmsChannels } from '../../db/schema';
import { memoCmsBuild } from './cms-build-context';

import { resolveEffectivelyEnabledChannelIds } from '@zenith/shared/cms';
export { resolveEffectivelyEnabledChannelIds } from '@zenith/shared/cms';

export async function getEffectivelyEnabledCmsChannelIds(
  siteId: number,
  executor: DbExecutor = db,
): Promise<Set<number>> {
  return new Set(await memoCmsBuild(`enabled-channels:${siteId}`, async () => {
  const rows = await executor.select({
    id: cmsChannels.id,
    parentId: cmsChannels.parentId,
    status: cmsChannels.status,
  }).from(cmsChannels).where(eq(cmsChannels.siteId, siteId));
  return resolveEffectivelyEnabledChannelIds(rows);
  }));
}

export async function isCmsChannelEffectivelyEnabled(
  siteId: number,
  channelId: number,
  executor: DbExecutor = db,
): Promise<boolean> {
  const ids = await getEffectivelyEnabledCmsChannelIds(siteId, executor);
  return ids.has(channelId);
}
