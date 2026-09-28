import { describe, expect, it } from 'vitest';
import { cmsStaticTargetKey, isCmsStaticTargetCompleted } from './cms-static-build-plan';

describe('CMS static build stable checkpoint keys', () => {
  it('orders phases and ids deterministically and resumes even when the exact previous target was deleted', () => {
    const channel1 = cmsStaticTargetKey('~site', 1, 1);
    const channel9 = cmsStaticTargetKey('~site', 1, 9);
    const content1 = cmsStaticTargetKey('~site', 2, 1);
    expect(channel1 < channel9).toBe(true);
    expect(channel9 < content1).toBe(true);
    expect(isCmsStaticTargetCompleted(channel1, cmsStaticTargetKey('~site', 1, 5))).toBe(true);
    expect(isCmsStaticTargetCompleted(channel9, cmsStaticTargetKey('~site', 1, 5))).toBe(false);
  });
  it('places metadata after all site targets during resume', () => {
    expect(isCmsStaticTargetCompleted(cmsStaticTargetKey('~meta', 0, 1), cmsStaticTargetKey('~site', 2, 50))).toBe(false);
    expect(isCmsStaticTargetCompleted(cmsStaticTargetKey('~site', 4, 50), cmsStaticTargetKey('~meta', 0, 1))).toBe(true);
  });
});
