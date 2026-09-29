import { eq } from 'drizzle-orm';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { cmsChannels } from '../../db/schema';
import { memoCmsBuild } from './cms-build-context';

type ChannelState = {
  id: number;
  parentId: number;
  status: 'enabled' | 'disabled';
};

/** Resolve effective channel status once for a site (self + every ancestor). */
export function resolveEffectivelyEnabledChannelIds(rows: readonly ChannelState[]): Set<number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const memo = new Map<number, boolean>();
  const visiting = new Set<number>();

  const isEnabled = (id: number): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false;
    const row = byId.get(id);
    if (!row || row.status !== 'enabled') {
      memo.set(id, false);
      return false;
    }
    if (row.parentId === 0) {
      memo.set(id, true);
      return true;
    }
    visiting.add(id);
    const result = isEnabled(row.parentId);
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  return new Set(rows.filter((row) => isEnabled(row.id)).map((row) => row.id));
}

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
