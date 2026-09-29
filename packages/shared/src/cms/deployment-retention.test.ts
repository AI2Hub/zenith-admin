import { describe, expect, it } from 'vitest';
import { cmsDeploymentRetentionDecisions, cmsTaskDeploymentReferences, type CmsDeploymentRetentionFacts } from './deployment-retention';

const now = new Date('2026-09-29T00:00:00Z');
const policy = { retainCount: 10, retainDays: 7, failedRetainDays: 1, automatic: false };
const row = (id: number, patch: Partial<CmsDeploymentRetentionFacts> = {}): CmsDeploymentRetentionFacts => ({ id, status: 'retired', releaseStatus: 'superseded', pinned: false, storageState: 'available', ageFrom: '2026-01-01T00:00:00Z', protectedBy: [], ...patch });
describe('CMS deployment retention policy', () => {
  it('bounds one hundred older deployments by the retained count while always protecting active, pins and references', () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(index + 1));
    rows[99].status = 'active'; rows[0].pinned = true; rows[1].protectedBy = ['待完成发布的基础版本'];
    const decisions = cmsDeploymentRetentionDecisions(rows, policy, now);
    expect([...decisions.values()].filter(reasons => !reasons.length)).toHaveLength(88);
    expect(decisions.get(1)).toContain('已设为重要版本'); expect(decisions.get(2)).toContain('待完成发布的基础版本');
    expect(decisions.get(100)).toContain('当前在线部署');
  });
  it('combines count OR age, separates failed age, and resumes purging without an age/count dead end', () => {
    const decisions = cmsDeploymentRetentionDecisions([
      row(1, { status: 'failed', releaseStatus: 'failed', ageFrom: '2026-09-28T23:00:00Z' }),
      row(2, { status: 'failed', releaseStatus: 'failed' }), row(3, { ageFrom: '2026-09-28T23:00:00Z' }),
      row(4, { storageState: 'purging', ageFrom: '2026-09-29T00:00:00Z' }), row(5, { storageState: 'purging', protectedBy: ['交付验证正在读取'] }),
    ], { ...policy, retainCount: 1 }, now);
    expect(decisions.get(1)).toContain('仍在 1 天保留期内'); expect(decisions.get(2)).toEqual([]);
    expect(decisions.get(3)).toContain('仍在 7 天保留期内'); expect(decisions.get(4)).toEqual([]);
    expect(decisions.get(5)).toEqual(['交付验证正在读取']);
  });
  it('finds scalar/array/nested build and delivery identities without treating content IDs as deployments', () => {
    expect(cmsTaskDeploymentReferences({ siteId: 1, contentId: 10, deploymentId: 20, frozen: { baseGenerationId: 30, targetDeploymentIds: [40, 41] }, generationId: '50' })).toEqual([20, 30, 40, 41, 50]);
  });
});
