import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskRunContext } from '../../lib/task-center/types';

const state = vi.hoisted(() => ({ ownsDispatch: true, result: null as unknown, animated: false, updates: [] as Array<Record<string, unknown>>, retained: [] as string[] }));
vi.mock('../../db', () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: async () => state.ownsDispatch ? [{ id: 9, cancelRequested: false }] : [] }) }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => {
      state.updates.push(values);
      return { where: () => ({ returning: async () => [{ id: 1 }] }) };
    } }),
  };
  return { db: {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{
      processing: { id: 1, taskId: 9, status: state.result ? 'success' : 'pending', result: state.result, focalPoint: { x: 0.5, y: 0.5 }, posterTime: 0, subtitleVersionId: null },
      source: { id: 2, siteId: 3, resourceId: 4, fileId: 'source', mimeType: 'image/gif' },
    }] }) }) }) }),
    transaction: async <T>(fn: (executor: typeof tx) => Promise<T>) => fn(tx),
  } };
});
vi.mock('../../lib/task-center', async () => ({ ...(await import('../../lib/task-center/types')), registerTaskHandler: vi.fn() }));
vi.mock('./cms-sites.service', () => ({ assertSiteAccess: vi.fn(async () => undefined) }));
vi.mock('./cms-media.service', () => ({ cmsMediaDerivedFileIds: (result: { variants: Array<{ fileId: string }> }) => result.variants.map((variant) => variant.fileId), cmsMediaUnfinishedCondition: () => null }));
vi.mock('../files/files.service', () => ({
  readFileContent: vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }) })),
  uploadManagedFile: vi.fn(async (file: File) => ({ id: file.name, url: `/files/${file.name}` })), deleteManagedFile: vi.fn(async () => undefined),
}));
vi.mock('../files/file-gc.service', () => ({ retainManagedFiles: vi.fn(async (_executor, ids: string[]) => { state.retained.push(...ids); }) }));
vi.mock('./cms-media-engine', () => ({
  readCmsImageMetadata: vi.fn(async () => ({ width: 200, height: 100, animated: state.animated, duration: state.animated ? 1 : null, format: 'gif', videoCodec: null, audioCodec: null })),
  makeCmsImageVariant: vi.fn(async () => ({ data: Buffer.from('variant'), info: { width: 200, height: 100 } })),
  readCmsAvMetadata: vi.fn(), makeCmsVideoPoster: vi.fn(), validateCmsWebVtt: vi.fn(),
}));

import { runCmsMediaProcessing } from './cms-media-tasks';
import { makeCmsImageVariant, readCmsImageMetadata } from './cms-media-engine';
import { deleteManagedFile } from '../files/files.service';

function context(): TaskRunContext {
  return { taskId: 9, dispatchToken: 'current', payload: { processingId: 1 }, checkpoint: null, attempt: 1,
    progress: vi.fn(async () => ({ cancelRequested: false })), reportItems: vi.fn(), isCancelRequested: async () => false };
}
beforeEach(() => { vi.clearAllMocks(); state.ownsDispatch = true; state.result = null; state.animated = false; state.updates.length = 0; state.retained.length = 0; });

describe('CMS media task ownership and immutable outputs', () => {
  it('does not start or overwrite status when a stale dispatch loses ownership', async () => {
    state.ownsDispatch = false;
    await expect(runCmsMediaProcessing(context())).rejects.toThrow('任务派发已变更');
    expect(state.updates).toEqual([]);
    expect(readCmsImageMetadata).not.toHaveBeenCalled();
  });

  it('returns an already completed output without regenerating files on task restart', async () => {
    state.result = { variants: [] };
    expect(await runCmsMediaProcessing(context())).toEqual({ processingId: 1, assetVersionId: 2 });
    expect(makeCmsImageVariant).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it('keeps animated media intact and persists its metadata without static derivatives', async () => {
    state.animated = true;
    await runCmsMediaProcessing(context());
    expect(makeCmsImageVariant).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ status: 'success', result: { animated: true, variants: [], duration: 1 } });
    expect(state.retained).toEqual([]);
  });

  it('rejects an ownership change at commit, cleans generated files and cannot overwrite the newer dispatch', async () => {
    const ctx = context();
    ctx.progress = vi.fn(async (update) => {
      if (update.processed === 4) state.ownsDispatch = false;
      return { cancelRequested: false };
    });
    await expect(runCmsMediaProcessing(ctx)).rejects.toThrow('任务派发已变更');
    expect(state.updates).toEqual([{ status: 'running', errorMessage: null }]);
    expect(deleteManagedFile).toHaveBeenCalledTimes(3);
    expect(state.retained).toEqual([]);
  });

  it('retains all three generated outputs in the result transaction', async () => {
    await runCmsMediaProcessing(context());
    expect(state.retained).toHaveLength(3);
    expect(state.updates.at(-1)).toMatchObject({ status: 'success', result: { variants: [
      expect.objectContaining({ targetWidth: 320 }), expect.objectContaining({ targetWidth: 768 }), expect.objectContaining({ targetWidth: 1440 }),
    ] } });
    expect(deleteManagedFile).not.toHaveBeenCalled();
  });
});
