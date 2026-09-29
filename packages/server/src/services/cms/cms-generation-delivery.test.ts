import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../../db/types';
import { cmsDeployments } from '../../db/schema/cms-releases';
import { cmsDeliveryStates } from '../../db/schema/cms-delivery';
import { readCmsGenerationDelivery } from './cms-generation-delivery';

function snapshotExecutor() {
  const tables: unknown[] = [];
  const executor = { select: vi.fn(() => ({ from: (table: unknown) => {
    tables.push(table);
    return { where: () => ({ limit: async () => table === cmsDeployments ? [{ releaseId: 8, visibilityEpoch: 2 }] : [{ epoch: 4 }] }) };
  } })) };
  return { executor: executor as unknown as DbExecutor, tables };
}

describe('CMS generation visibility snapshots', () => {
  it('loads both live and frozen epochs using only the caller snapshot executor', async () => {
    const { executor, tables } = snapshotExecutor();
    expect(await readCmsGenerationDelivery(executor, 3, 17, false)).toEqual({ releaseId: 8, capturedVisibilityEpoch: 2, visibilityEpoch: 4 });
    expect(tables).toEqual([cmsDeployments, cmsDeliveryStates]);
  });
  it('keeps candidate rendering frozen without acquiring another generation lock or reading live epoch', async () => {
    const { executor, tables } = snapshotExecutor();
    expect(await readCmsGenerationDelivery(executor, 3, 17, true)).toEqual({ releaseId: 8, capturedVisibilityEpoch: 2, visibilityEpoch: 2 });
    expect(tables).toEqual([cmsDeployments]);
  });
});
