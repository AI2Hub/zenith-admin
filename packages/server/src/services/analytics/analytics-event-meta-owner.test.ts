import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';

const { select, insert, update, invalidateGovernanceCache } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  invalidateGovernanceCache: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: { select, insert, update },
}));

vi.mock('./analytics-governance.service', () => ({
  invalidateGovernanceCache,
}));

vi.mock('../../lib/context', () => ({
  currentUser: () => ({ userId: 1, roles: ['super_admin'], tenantId: null }),
}));

vi.mock('../../lib/tenant', () => ({
  isPlatformAdmin: () => true,
}));

import { createEventMeta, updateEventMeta } from './analytics-event-meta.service';

const ownerRow = { nickname: '张三', status: 'enabled' as const };
const metaRow = {
  id: 1, eventName: 'order_submit', displayName: null, category: 'custom', description: null,
  propertySchema: null, status: 'active' as const, version: 1, ownerId: 9, ownerName: '张三', strictMode: false,
  eventCount: 0, firstSeenAt: null, lastSeenAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('analytics-event-meta.service — owner server-side resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an ownerId that does not exist or is disabled', async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    await expect(createEventMeta({ eventName: 'x', ownerId: 999, strictMode: false })).rejects.toThrow(HTTPException);

    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ nickname: '李四', status: 'disabled' }] }) }) });
    await expect(createEventMeta({ eventName: 'x', ownerId: 2, strictMode: false })).rejects.toThrow(HTTPException);
  });

  it('ignores a client-supplied ownerName and persists the server-resolved nickname instead', async () => {
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [ownerRow] }) }) });
    const insertValues = vi.fn().mockReturnValue({ returning: async () => [metaRow] });
    insert.mockReturnValue({ values: insertValues });

    await createEventMeta({
      eventName: 'order_submit',
      ownerId: 9,
      ownerName: '恶意伪造的名字', // 客户端伪造值：必须被忽略
      strictMode: false,
    } as never);

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ ownerName: '张三' }));
    expect(invalidateGovernanceCache).toHaveBeenCalledTimes(1);
  });

  it('resolves ownerName server-side on update too, and clears it when ownerId is explicitly set to null', async () => {
    select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [metaRow] }) }) }) // ensureEventMetaExists
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [ownerRow] }) }) }); // resolveOwnerName
    const setFn = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [metaRow] }) });
    update.mockReturnValue({ set: setFn });

    await updateEventMeta(1, { ownerId: 9, ownerName: 'anything' } as never);
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 9, ownerName: '张三' }));

    vi.clearAllMocks();
    select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [metaRow] }) }) });
    const setFn2 = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [metaRow] }) });
    update.mockReturnValue({ set: setFn2 });
    await updateEventMeta(1, { ownerId: null } as never);
    expect(setFn2).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null, ownerName: null }));
  });
});
