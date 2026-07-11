import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';

const { select, insert, update, del, invalidateGovernanceCache } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  invalidateGovernanceCache: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: { select, insert, update, delete: del, $count: vi.fn(async () => 0) },
}));

vi.mock('./analytics-governance.service', () => ({
  invalidateGovernanceCache,
}));

let effectiveTenantId: number | null = 5;
vi.mock('../../lib/tenant', () => ({
  getEffectiveTenantId: () => effectiveTenantId,
}));

vi.mock('../../lib/context', () => ({
  currentUser: () => ({ userId: 1, tenantId: effectiveTenantId, roles: ['user'] }),
}));

import {
  createEventOverride,
  deleteEventOverride,
  listEventOverrides,
  requireViewingTenantId,
  updateEventOverride,
} from './analytics-event-overrides.service';

const overrideRow = {
  id: 1,
  tenantId: 5,
  eventName: 'checkout',
  status: 'disabled' as const,
  reason: '灰度期间暂停',
  createdBy: 1,
  updatedBy: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('analytics-event-overrides.service — tenant safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    effectiveTenantId = 5;
  });

  it('rejects list/create/update/delete with 400 when a platform admin has not selected a viewing tenant', async () => {
    effectiveTenantId = null;
    await expect(listEventOverrides({})).rejects.toThrow(HTTPException);
    await expect(createEventOverride({ eventName: 'x', status: 'disabled' })).rejects.toThrow(HTTPException);
    await expect(updateEventOverride(1, { status: 'enabled' })).rejects.toThrow(HTTPException);
    await expect(deleteEventOverride(1)).rejects.toThrow(HTTPException);
  });

  it('requireViewingTenantId returns the effective tenant when one is selected', () => {
    expect(requireViewingTenantId()).toBe(5);
  });
});

describe('analytics-event-overrides.service — CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    effectiveTenantId = 5;
  });

  it('creates an override scoped to the viewing tenant and invalidates the governance cache', async () => {
    insert.mockReturnValue({ values: () => ({ returning: async () => [overrideRow] }) });
    const result = await createEventOverride({ eventName: 'checkout', status: 'disabled', reason: '灰度期间暂停' });
    expect(result).toMatchObject({ id: 1, tenantId: 5, eventName: 'checkout', status: 'disabled' });
    expect(invalidateGovernanceCache).toHaveBeenCalledTimes(1);
  });

  it('maps a unique-constraint violation on (tenantId, eventName) to a 400 business error', async () => {
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    insert.mockReturnValue({ values: () => ({ returning: async () => { throw pgError; } }) });
    await expect(createEventOverride({ eventName: 'checkout', status: 'disabled' })).rejects.toMatchObject({ status: 400 });
  });

  it('lists overrides scoped to the current viewing tenant only', async () => {
    select.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: async () => [overrideRow],
            }),
          }),
        }),
      }),
    });
    const result = await listEventOverrides({ page: 1, pageSize: 20 });
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({ tenantId: 5 });
  });

  it('updates and invalidates governance cache', async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [overrideRow] }) }) });
    update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [{ ...overrideRow, status: 'enabled' }] }) }) });
    const result = await updateEventOverride(1, { status: 'enabled' });
    expect(result.status).toBe('enabled');
    expect(invalidateGovernanceCache).toHaveBeenCalledTimes(1);
  });

  it('404s when updating/deleting an override that does not belong to the viewing tenant', async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    await expect(updateEventOverride(999, { status: 'enabled' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteEventOverride(999)).rejects.toMatchObject({ status: 404 });
  });

  it('deletes and invalidates governance cache', async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [overrideRow] }) }) });
    del.mockReturnValue({ where: async () => undefined });
    await deleteEventOverride(1);
    expect(invalidateGovernanceCache).toHaveBeenCalledTimes(1);
  });
});
