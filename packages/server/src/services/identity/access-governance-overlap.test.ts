import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../../db/types';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../messaging/notification-outbox.service', () => ({ notify: vi.fn() }));

import { assertNoOverlappingAccessRequest } from './access-governance.service';

const requestedItem = {
  itemType: 'menu' as const,
  roleId: null,
  menuId: 10,
  permissionCode: 'system:user:assign',
  permissionLabel: '用户授权',
  dataScope: null,
  deptScopeIds: [],
  snapshot: {},
};

function executorWith(options: { grants?: unknown[]; requests?: unknown[] } = {}) {
  return {
    query: {
      identityAccessGrants: { findMany: vi.fn().mockResolvedValue(options.grants ?? []) },
      identityAccessRequests: { findMany: vi.fn().mockResolvedValue(options.requests ?? []) },
    },
  } as unknown as DbExecutor;
}

const input = {
  targetUserId: 7,
  tenantId: null,
  startsAt: new Date('2026-10-18T08:00:00Z'),
  expiresAt: new Date('2026-10-18T12:00:00Z'),
  items: [requestedItem],
};

describe('access request overlap guard', () => {
  it('rejects a permission already covered by an effective grant', async () => {
    const executor = executorWith({ grants: [{ menus: [{ menuId: 10 }] }] });

    await expect(assertNoOverlappingAccessRequest(input, executor)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('用户授权'),
    });
  });

  it('rejects a permission already present in a pending request', async () => {
    const executor = executorWith({ requests: [{ items: [{ menuId: 10 }] }] });

    await expect(assertNoOverlappingAccessRequest(input, executor)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('请勿重复申请'),
    });
  });

  it('allows unrelated permissions', async () => {
    const executor = executorWith({ grants: [{ menus: [{ menuId: 11 }] }], requests: [{ items: [{ menuId: 12 }] }] });

    await expect(assertNoOverlappingAccessRequest(input, executor)).resolves.toBeUndefined();
  });
});
