import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction, txInsert, touchEventMeta } = vi.hoisted(() => ({
  transaction: vi.fn(),
  txInsert: vi.fn(),
  touchEventMeta: vi.fn(async () => undefined),
}));

vi.mock('../../db', () => ({
  db: { transaction },
}));

vi.mock('../../lib/context', () => ({
  currentUserOrNull: () => ({
    userId: 42,
    username: 'alice',
    roles: ['user'],
    tenantId: 11,
  }),
  currentUser: () => ({
    userId: 42,
    username: 'alice',
    roles: ['user'],
    tenantId: 11,
  }),
}));

vi.mock('../../lib/tenant', () => ({
  getCreateTenantId: () => 11,
  tenantScope: () => undefined,
  getEffectiveTenantId: () => 11,
  isPlatformAdmin: () => false,
}));

vi.mock('../../lib/analytics-helpers', () => ({
  parseClientEnv: () => ({
    browser: 'Chrome',
    browserVersion: '1',
    os: 'Windows',
    osVersion: '1',
    deviceType: 'desktop',
  }),
  lookupIpGeo: () => ({ country: '中国', region: '北京', city: '北京' }),
  anonymizeIpAddr: (ip: string) => ip,
  clampDays: (_value: unknown, fallback: number) => fallback,
  clampLimit: (_value: unknown, fallback: number) => fallback,
  startOfDaysAgo: () => new Date(),
}));

vi.mock('./analytics-event-meta.service', () => ({
  getBlockedEventNames: async () => new Set<string>(),
  touchEventMeta,
}));

vi.mock('./analytics-settings.service', () => ({
  getIngestPolicy: async () => ({ anonymizeIp: false }),
}));

vi.mock('../../lib/ws-manager', () => ({
  broadcast: vi.fn(),
}));

import { batchInsertEvents } from './analytics.service';

describe('analytics event ingest transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation(async (callback: (tx: { insert: typeof txInsert }) => Promise<unknown>) => callback({ insert: txInsert }));
  });

  it('writes a fresh event and its session in one transaction', async () => {
    txInsert
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ eventId: '0ec7ca87-c75a-42a2-b523-8f7f96a06f2a' }],
          }),
        }),
      })
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoUpdate: async () => undefined,
        }),
      });

    await batchInsertEvents([{
      eventId: '0ec7ca87-c75a-42a2-b523-8f7f96a06f2a',
      sessionId: 'cd18cffd-badc-4d8b-8365-a49d77797fd0',
      distinctId: 'u:forged',
      eventType: 'page_view',
      pagePath: '/',
    }], { ip: '127.0.0.1', ua: 'test' });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(2);
    expect(touchEventMeta).toHaveBeenCalledTimes(1);
  });

  it('does not increment the session when eventId is a duplicate', async () => {
    txInsert.mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
      }),
    });

    await batchInsertEvents([{
      eventId: '0ec7ca87-c75a-42a2-b523-8f7f96a06f2a',
      sessionId: 'cd18cffd-badc-4d8b-8365-a49d77797fd0',
      eventType: 'page_view',
      pagePath: '/',
    }], { ip: '127.0.0.1', ua: 'test' });

    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(touchEventMeta).not.toHaveBeenCalled();
  });
});
