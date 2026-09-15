import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../../../db/types';
import { assertWorkflowFormUpdatesCurrent, lockUnchangedWorkflowDraft } from './signature-concurrency';

const draft = { id: 3, status: 'draft' as const, formData: { sign: { signedAt: '2026-09-15 10:00:00' } }, formSnapshot: null, definitionSnapshot: null };
function executor(row: unknown) {
  const lock = vi.fn(() => query);
  const query = { from: () => query, where: () => query, for: lock, limit: async () => row ? [row] : [] };
  return { db: { select: () => query } as unknown as DbExecutor, lock };
}

describe('workflow signature concurrency', () => {
  it('locks the unchanged draft before allowing submission', async () => {
    const tx = executor(structuredClone(draft));
    await lockUnchangedWorkflowDraft(tx.db, draft);
    expect(tx.lock).toHaveBeenCalledWith('update');
  });

  it.each([
    { ...draft, status: 'running' },
    { ...draft, formData: { sign: { signedAt: '2026-09-15 10:01:00' } } },
    { ...draft, formSnapshot: { fields: [{ key: 'sign', signaturePolicy: 'handwritten' }] } },
    { ...draft, definitionSnapshot: { version: 2 } },
    null,
  ])('rejects a concurrent submit or changed signature/definition before mutation', async (row) => {
    await expect(lockUnchangedWorkflowDraft(executor(row).db, draft)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects conflicting form signatures while preserving disjoint parallel edits', () => {
    expect(() => assertWorkflowFormUpdatesCurrent({ sign: 'old' }, { sign: 'new' }, { sign: 'old' })).toThrow('审批表单已变化');
    expect(() => assertWorkflowFormUpdatesCurrent({ amount: 1, note: 'old' }, { amount: 1, note: 'new' }, { amount: 2 })).not.toThrow();
  });
});
