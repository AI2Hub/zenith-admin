import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSettings, currentUserOrNull, currentMemberOrNull, resolveSiteByKey } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  currentUserOrNull: vi.fn(),
  currentMemberOrNull: vi.fn(),
  resolveSiteByKey: vi.fn(),
}));

vi.mock('../../lib/settings', () => ({ getSettings }));
vi.mock('../../lib/context', () => ({ currentUserOrNull }));
vi.mock('../../lib/member-context', () => ({ currentMemberOrNull }));
vi.mock('./analytics-sites.service', () => ({ resolveSiteByKey }));

import { getPublicConfig, getIngestPolicy, isErrorIgnored } from './analytics-settings.service';

const settings = {
  enabled: true, sampleRate: 0.5, trackPageviews: true, trackClicks: true, trackPerformance: true,
  trackErrors: true, trackApi: true, maskInputs: true, respectDnt: false, anonymizeIp: true,
  blacklistPaths: ['/login'], errorIgnorePatterns: ['Invalid DOM property'], retentionDays: 180,
  errorRetentionDays: 90, sessionTimeoutMinutes: 30, trackReplay: false, replaySessionSampleRate: 0,
  replayOnError: true, replayMaskAllText: false, replayBlockSelector: '', replayRetentionDays: 30,
  replayStorageQuotaMb: 4096,
};

describe('analytics settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserOrNull.mockReturnValue(null);
    currentMemberOrNull.mockReturnValue(undefined);
    resolveSiteByKey.mockResolvedValue(null);
    getSettings.mockResolvedValue(settings);
  });

  it('reads public config from the analytics system setting', async () => {
    await expect(getPublicConfig('site-key')).resolves.toMatchObject({ sampleRate: 0.5 });
    expect(getSettings).toHaveBeenCalledWith('analytics', { tenantId: null });
  });

  it('uses member tenant and keeps server-only fields private', async () => {
    currentMemberOrNull.mockReturnValue({ tenantId: 11 });
    await expect(getPublicConfig()).resolves.toMatchObject({ sampleRate: 0.5 });
    expect(getSettings).toHaveBeenCalledWith('analytics', { tenantId: 11 });
  });

  it('reads ingest privacy and cached ignore rules from system settings', async () => {
    await expect(getIngestPolicy(11)).resolves.toEqual({ anonymizeIp: true });
    await expect(isErrorIgnored(11, 'Invalid DOM property: x')).resolves.toBe(true);
  });
});
