import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbTransaction } from '../../db/types';

const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), allocate: vi.fn(), attach: vi.fn(), available: vi.fn(), channel: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('../../lib/context', () => ({ currentUser: () => ({ userId: 9, tenantId: 7 }) }));
vi.mock('../../lib/tenant', async (importOriginal) => ({ ...await importOriginal<typeof import('../../lib/tenant')>(), requireTenantScopeId: () => 7 }));
vi.mock('../../lib/settings', () => ({ getSettings: async () => ({ transferApprovalThreshold: 100 }) }));
vi.mock('./payment-apps.service', () => ({ resolveApplicationChannelConfig: async () => ({ appId: 2, channelConfigId: 3 }) }));
vi.mock('./payment-channel-config-resolver', () => ({ assertPaymentEngineConfig: vi.fn(), resolvePaymentChannelConfig: async () => ({ id: 3, channelAccountId: 4, credentialVersion: 1 }) }));
vi.mock('./payment-capability-evaluator', () => ({ assertEffectivePaymentOperation: vi.fn() }));
vi.mock('./payment.service', () => ({ buildAdapterContext: vi.fn() }));
vi.mock('../../lib/payment/registry', () => ({ getAdapter: () => ({ transfer: mocks.channel }) }));
vi.mock('./payment-journal.service', () => ({ ensureSystemLedgerAccount: async () => ({ id: 11, channelAccountId: 4 }), computeAccountAvailable: mocks.available, postSystemJournal: vi.fn() }));
vi.mock('../platform/numbering-runtime', () => ({ allocateBusinessNumber: mocks.allocate, attachBusinessNumber: mocks.attach }));

import { paymentFundReservations, paymentTransfers } from '../../db/schema';
import { createTransfer } from './payment-transfer.service';

function fixture() {
  const stages: string[] = [];
  let transfer: Record<string, unknown> | undefined;
  let reservation: Record<string, unknown> | undefined;
  let failInsert = false;
  const query = { where: (_where: unknown) => query, limit: (_limit: number) => query,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(transfer ? [transfer] : []).then(resolve) };
  mocks.select.mockImplementation(() => ({ from: () => query }));
  const tx = {
    select: mocks.select, execute: async () => { stages.push('account-lock'); },
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => ({ returning: async () => {
      if (table === paymentTransfers) {
        if (failInsert) throw new Error('transfer insert failed');
        transfer = { id: 12, ...values }; stages.push('transfer'); return [transfer];
      }
      expect(table).toBe(paymentFundReservations);
      reservation = { id: 13, ...values }; stages.push('reserve'); return [reservation];
    } }) }),
  } as unknown as DbTransaction;
  mocks.available.mockResolvedValue(1000n);
  mocks.allocate.mockImplementation(async (executor: DbTransaction) => { expect(executor).toBe(tx); stages.push('allocate'); return 'CUSTOMTRF0001'; });
  mocks.attach.mockImplementation(async (executor: DbTransaction) => { expect(executor).toBe(tx); stages.push('attach'); });
  mocks.transaction.mockImplementation(async (work: (executor: DbTransaction) => Promise<unknown>) => {
    try { const result = await work(tx); stages.push('commit'); return result; }
    catch (error) { transfer = undefined; reservation = undefined; stages.push('rollback'); throw error; }
  });
  return { tx, stages, reservation: () => reservation, transfer: () => transfer, failInsert: () => { failInsert = true; } };
}

const input = { applicationId: 2, channel: 'wechat' as const, currency: 'CNY' as const, receiverAccount: 'openid', amount: 500, remark: 'Supplier payment', idempotencyKey: 'supplier-payment-1' };
beforeEach(() => vi.clearAllMocks());

describe('transfer allocation and fund reservation', () => {
  it('commits the number, fund reservation and business row in one transaction before approval', async () => {
    const f = fixture();
    await createTransfer(input);
    expect(f.stages).toEqual(['allocate', 'account-lock', 'reserve', 'transfer', 'attach', 'commit']);
    expect(mocks.allocate).toHaveBeenCalledWith(f.tx, expect.objectContaining({ scene: 'payment.transfer', tenantId: 7, allocationKey: 'app:2:request:supplier-payment-1' }));
    expect(f.reservation()).toMatchObject({ sourceId: 'CUSTOMTRF0001', amount: 500n });
    expect(f.transfer()).toMatchObject({ transferNo: 'CUSTOMTRF0001', outTransferNo: 'CUSTOMTRF0001', fundReservationId: 13, approvalStatus: 'pending' });
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('replays a transfer request without allocating or reserving funds again', async () => {
    const f = fixture();
    await createTransfer(input);
    await createTransfer(input);
    expect(mocks.allocate).toHaveBeenCalledTimes(1);
    expect(mocks.available).toHaveBeenCalledTimes(1);
    expect(f.stages.filter(stage => stage === 'reserve')).toHaveLength(1);
  });

  it('rolls back allocation when the available balance is insufficient', async () => {
    const f = fixture(); mocks.available.mockResolvedValue(100n);
    await expect(createTransfer(input)).rejects.toThrow('可用余额不足');
    expect(f.stages.at(-1)).toBe('rollback');
    expect(f.reservation()).toBeUndefined();
    expect(f.transfer()).toBeUndefined();
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('rolls back fund reservation when writing the business row fails', async () => {
    const f = fixture(); f.failInsert();
    await expect(createTransfer(input)).rejects.toThrow('transfer insert failed');
    expect(f.reservation()).toBeUndefined();
    expect(f.transfer()).toBeUndefined();
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('rejects a changed amount under the same transfer idempotency key', async () => {
    fixture(); await createTransfer(input);
    await expect(createTransfer({ ...input, amount: 600 })).rejects.toThrow('同一 Idempotency-Key 不可用于不同转账请求');
    expect(mocks.allocate).toHaveBeenCalledTimes(1);
    expect(mocks.available).toHaveBeenCalledTimes(1);
  });
});
