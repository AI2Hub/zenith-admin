import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsDeploymentRow, CmsReleaseRow } from '../../db/schema';
import type { TaskRunContext } from '../../lib/task-center/types';

const mocks = vi.hoisted(() => ({ verifyArtifacts: vi.fn() }));
vi.mock('./cms-generation-storage.service', async (original) => ({
  ...await original<typeof import('./cms-generation-storage.service')>(),
  verifyCmsGenerationArtifacts: mocks.verifyArtifacts,
}));
import { buildCmsReleaseCandidate } from './cms-release-build.service';

describe('CMS completed candidate task progress', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('reports a terminal 1/1 after verifying an already sealed candidate', async () => {
    mocks.verifyArtifacts.mockResolvedValue(undefined);
    const progress = vi.fn().mockResolvedValue({ cancelRequested: false });
    const guard = vi.fn();
    await buildCmsReleaseCandidate({ status: 'building' } as CmsReleaseRow, { id: 17, status: 'ready', snapshot: {} } as CmsDeploymentRow, { progress } as unknown as TaskRunContext, guard);
    expect(mocks.verifyArtifacts).toHaveBeenCalledWith(17, {});
    expect(progress).toHaveBeenCalledWith({ processed: 1, total: 1, note: '候选部署构建完成', checkpoint: { generationId: 17, phase: 'completed' } });
    expect(guard).not.toHaveBeenCalled();
  });
  it('does not report completion for a corrupted candidate and respects a cancelled dispatch', async () => {
    const progress = vi.fn().mockResolvedValue({ cancelRequested: true });
    mocks.verifyArtifacts.mockRejectedValueOnce(new Error('checksum mismatch'));
    const run = () => buildCmsReleaseCandidate({ status: 'building' } as CmsReleaseRow, { id: 17, status: 'ready', snapshot: {} } as CmsDeploymentRow, { progress } as unknown as TaskRunContext, vi.fn());
    await expect(run()).rejects.toThrow('checksum mismatch');
    expect(progress).not.toHaveBeenCalled();
    mocks.verifyArtifacts.mockResolvedValue(undefined);
    await expect(run()).rejects.toThrow('发布执行轮次已失效或已取消');
  });
});
