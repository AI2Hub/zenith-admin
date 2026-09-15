import { describe, expect, it, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../../db/types';
import { userSignatures } from '../../db/schema';
const { release } = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('../files/file-gc.service', () => ({ releaseManagedFiles: release }));
import { releaseIdentitySignatures } from './user-signature-lifecycle';

function executor(fileIds: string[]) {
  const detach = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: detach }));
  const where = vi.fn(() => ({ returning: async () => fileIds.map((fileId) => ({ fileId })) }));
  const value = { delete: vi.fn(() => ({ where })), update: vi.fn(() => ({ set })) };
  return { value: value as unknown as DbExecutor, where, set, detach };
}
beforeEach(() => { vi.clearAllMocks(); release.mockResolvedValue(undefined); });

describe('signature references during identity removal', () => {
  it('releases every deleted account template in the caller transaction', async () => {
    const tx = executor(['file-a', 'file-b']);
    const condition = eq(userSignatures.userId, 7);
    await releaseIdentitySignatures(tx.value, condition);
    expect(tx.where).toHaveBeenCalledWith(condition);
    expect(release).toHaveBeenCalledWith(tx.value, ['file-a', 'file-b']);
    expect(tx.set).not.toHaveBeenCalled();
  });
  it('keeps only removed-tenant signature file metadata for GC, still restricted', async () => {
    const tx = executor(['file-a', 'file-b']);
    await releaseIdentitySignatures(tx.value, eq(userSignatures.tenantId, 3), 3);
    expect(tx.set).toHaveBeenCalledWith({ tenantId: null });
    const query = new PgDialect().sqlToQuery(tx.detach.mock.calls[0][0]);
    expect(query.params).toEqual(['file-a', 'file-b', 3, 'restricted']);
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(tx.set.mock.invocationCallOrder[0]);
  });
  it('does not alter any file when the removed identity has no templates', async () => {
    const tx = executor([]);
    await releaseIdentitySignatures(tx.value, eq(userSignatures.userId, 7), 3);
    expect(release).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
  });
  it('propagates release errors so the identity transaction rolls back', async () => {
    const tx = executor(['file-a']);
    release.mockRejectedValueOnce(new Error('reference count mismatch'));
    await expect(releaseIdentitySignatures(tx.value, eq(userSignatures.userId, 7), 3)).rejects.toThrow('reference count mismatch');
    expect(tx.set).not.toHaveBeenCalled();
  });
});
