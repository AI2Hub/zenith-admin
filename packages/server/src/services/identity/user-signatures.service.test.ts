import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({
  impersonation: false,
  platformView: null as number | null,
  rows: [] as unknown[][],
  wheres: [] as unknown[],
  writes: [] as Record<string, unknown>[],
  returned: [] as unknown[],
  locks: [] as string[],
  upload: vi.fn(), read: vi.fn(), retain: vi.fn(), release: vi.fn(), normalize: vi.fn(),
}));
vi.mock('../../config', async (original) => {
  const actual = await original<typeof import('../../config')>();
  return { ...actual, config: { ...actual.config, multiTenantMode: true } };
});
vi.mock('../../db', () => {
  const select = () => {
    const chain = { from: () => chain, where: (condition: unknown) => { state.wheres.push(condition); return chain; },
      for: (mode: string) => { state.locks.push(mode); return chain; }, limit: async () => state.rows.shift() ?? [] };
    return chain;
  };
  const write = () => {
    const chain = { set: (values: Record<string, unknown>) => { state.writes.push(values); return chain; },
      values: (values: Record<string, unknown>) => { state.writes.push(values); return chain; },
      where: (condition: unknown) => { state.wheres.push(condition); return chain; }, returning: async () => state.returned };
    return chain;
  };
  const tx = { select, insert: write, update: write, delete: write };
  return { db: { ...tx, transaction: async (fn: (executor: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('../../lib/context', () => {
  const actor = () => ({ userId: 7, username: 'signer', tenantId: state.platformView == null ? 2 : null, roles: state.platformView == null ? [] : ['super_admin'], viewingTenantId: state.platformView,
    ...(state.impersonation ? { impersonation: { id: 1, byUserId: 99, byUsername: 'admin', readOnly: false } } : {}),
  });
  return { currentUser: actor, currentUserOrNull: actor };
});
vi.mock('../files/files.service', () => ({ saveGeneratedManagedFile: state.upload, readGeneratedManagedFile: state.read }));
vi.mock('../files/file-gc.service', () => ({ retainManagedFiles: state.retain, releaseManagedFiles: state.release }));
vi.mock('./signature-image', () => ({ normalizeSignatureImage: state.normalize }));

import { deleteMySignature, getMySignature, resolveUserSignature, saveMySignature } from './user-signatures.service';

const stored = { id: 11, userId: 7, tenantId: 2, fileId: 'file-old', version: 3, updatedAt: new Date('2026-09-15T04:00:00Z') };
const dataUrl = 'data:image/png;base64,YWJj';
function whereParams(index: number) { return new PgDialect().sqlToQuery(state.wheres[index] as Parameters<PgDialect['sqlToQuery']>[0]).params; }

beforeEach(() => {
  vi.clearAllMocks(); state.impersonation = false; state.platformView = null; state.rows = []; state.wheres = []; state.writes = []; state.returned = []; state.locks = [];
  state.normalize.mockResolvedValue({ buffer: Buffer.from('abc'), dataUrl });
  state.upload.mockResolvedValue({ id: 'file-new' });
  state.read.mockImplementation(async () => ({ stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(Buffer.from('abc'))); controller.close(); } }) }));
});

describe('my private signature', () => {
  it('reads only the current owner and tenant, using controlled storage', async () => {
    state.rows = [[stored]];
    expect(await getMySignature()).toMatchObject({ id: 11, version: 3, dataUrl });
    expect(whereParams(0)).toEqual([7, 2]);
    expect(state.read).toHaveBeenCalledWith('file-old', 2);
  });
  it('returns null for an account without a saved signature', async () => {
    expect(await getMySignature()).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
  });
  it('updates the template version and atomically switches retained file references', async () => {
    state.rows = [[{ id: 2 }], [{ id: 7 }], [stored]];
    state.returned = [{ ...stored, version: 4, fileId: 'file-new' }];
    expect(await saveMySignature({ dataUrl })).toMatchObject({ id: 11, version: 4, dataUrl });
    expect(state.upload).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'restricted', tenantId: 2, createdBy: 7 }));
    expect(state.locks).toEqual(['key share', 'update']);
    expect(state.writes).toContainEqual({ fileId: 'file-new', version: 4 });
    expect(state.retain).toHaveBeenCalledWith(expect.anything(), ['file-new']);
    expect(state.release).toHaveBeenCalledWith(expect.anything(), ['file-old']);
  });
  it('deletion releases the private template, without touching signed task snapshots', async () => {
    state.rows = [[{ id: 7 }]]; state.returned = [{ fileId: 'file-old' }];
    await deleteMySignature();
    expect(state.locks).toEqual(['update']);
    expect(whereParams(1)).toEqual([7, 2]);
    expect(state.release).toHaveBeenCalledWith(expect.anything(), ['file-old']);
  });
});

describe('signature resolution for business operations', () => {
  it('requires ownership, tenant, template id and exact version for reuse', async () => {
    state.rows = [[stored], [{ nickname: '真实签署人' }]];
    const result = await resolveUserSignature({ source: 'saved', signatureId: 11, version: 3 }, 'reusable');
    expect(whereParams(0)).toEqual([7, 2, 11]);
    expect(result).toMatchObject({ dataUrl, source: 'saved', signerId: 7, signerName: '真实签署人', signatureId: 11, signatureVersion: 3 });
    expect(result.signedAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });
  it('rejects a stale version or deleted/foreign template before reading the image', async () => {
    state.rows = [[stored], []];
    await expect(resolveUserSignature({ source: 'saved', signatureId: 11, version: 2 }, 'reusable')).rejects.toThrow('已更换或删除');
    await expect(resolveUserSignature({ source: 'saved', signatureId: 99, version: 3 }, 'reusable')).rejects.toThrow('已更换或删除');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('handwritten policy rejects a reusable template', async () => {
    await expect(resolveUserSignature({ source: 'saved', signatureId: 11, version: 3 }, 'handwritten')).rejects.toThrow('本次重新手写');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('generates metadata from the server identity for fresh handwriting', async () => {
    state.rows = [[{ nickname: '真实签署人' }]];
    const result = await resolveUserSignature({ source: 'drawn', dataUrl }, 'handwritten');
    expect(state.normalize).toHaveBeenCalledWith(dataUrl);
    expect(result).toMatchObject({ source: 'drawn', signerId: 7, signerName: '真实签署人', signatureId: null, signatureVersion: null });
  });
  it('rejects client-forged signer/time metadata', async () => {
    await expect(resolveUserSignature({ source: 'drawn', dataUrl, signerId: 999 } as never, 'reusable')).rejects.toThrow('输入无效');
    expect(state.normalize).not.toHaveBeenCalled();
  });
});

describe('impersonation signature boundary', () => {
  it.each(['read', 'save', 'delete', 'drawn', 'saved'] as const)('blocks %s before reading files or producing evidence', async (operation) => {
    state.impersonation = true;
    const run = () => {
      if (operation === 'read') return getMySignature();
      if (operation === 'save') return saveMySignature({ dataUrl });
      if (operation === 'delete') return deleteMySignature();
      const input = operation === 'drawn' ? { source: 'drawn' as const, dataUrl } : { source: 'saved' as const, signatureId: 11, version: 3 };
      // 即便调用方只传userId/tenantId，仍检查当前认证上下文，不能洗掉模拟标记。
      return resolveUserSignature(input, 'reusable', { userId: 7, tenantId: 2 });
    };
    await expect(run()).rejects.toThrow('模拟登录期间不能签署或管理签名');
    expect(state.read).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.normalize).not.toHaveBeenCalled();
  });
});

describe('platform tenant signature separation', () => {
  it('uses the effective tenant view for personal template reads', async () => {
    state.platformView = 31;
    await getMySignature();
    state.platformView = 32;
    await getMySignature();
    expect(whereParams(0)).toEqual([7, 31]);
    expect(whereParams(1)).toEqual([7, 32]);
  });
  it('uses that same view when resolving a saved signature by default', async () => {
    state.platformView = 31;
    await expect(resolveUserSignature({ source: 'saved', signatureId: 11, version: 3 }, 'reusable')).rejects.toThrow('已更换或删除');
    expect(whereParams(0)).toEqual([7, 31, 11]);
  });
});
