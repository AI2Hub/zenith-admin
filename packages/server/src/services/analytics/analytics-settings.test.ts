import { beforeEach, describe, expect, it, vi } from 'vitest';

const { select, insert, onConflictDoNothing, returning } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: { select, insert },
}));

vi.mock('../../lib/tenant', () => ({
  currentCreateTenantId: () => 11,
  getCreateTenantId: () => 11,
}));

vi.mock('../../lib/context', () => ({
  currentUserOrNull: () => null,
}));

import { getSettings } from './analytics-settings.service';

const row = {
  id: 9,
  tenantId: 11,
  enabled: true,
  sampleRate: 1,
  trackPageviews: true,
  trackClicks: true,
  trackPerformance: true,
  trackErrors: true,
  trackApi: true,
  maskInputs: true,
  respectDnt: false,
  anonymizeIp: false,
  blacklistPaths: [],
  retentionDays: 180,
  errorRetentionDays: 90,
  sessionTimeoutMinutes: 30,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('analytics settings creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const results = [[], [row]];
    select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => results.shift() ?? [],
        }),
      }),
    }));
    returning.mockResolvedValue([]);
    onConflictDoNothing.mockReturnValue({ returning });
    insert.mockReturnValue({
      values: () => ({ onConflictDoNothing }),
    });
  });

  it('recovers from a concurrent first insert through the unique constraint', async () => {
    await expect(getSettings()).resolves.toMatchObject({ id: 9, sessionTimeoutMinutes: 30 });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
