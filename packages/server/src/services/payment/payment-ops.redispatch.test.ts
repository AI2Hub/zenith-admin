import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentEventRow } from '../../db/schema';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  processEvent: vi.fn(),
  interruptAttempts: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock('../../db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('../../lib/context', () => ({ currentUser: mocks.currentUser }));
vi.mock('../../lib/tenant', () => ({
  getTenantScopeId: vi.fn(),
  tenantCondition: vi.fn(),
}));
vi.mock('./payment-events.service', () => ({ getPaymentEventHealth: vi.fn() }));
vi.mock('./payment-outbox.service', () => ({
  processEvent: mocks.processEvent,
  interruptProcessingPaymentEventAttempts: mocks.interruptAttempts,
}));
vi.mock('./payment.service', () => ({
  buildAdapterContext: vi.fn(),
  handleNotify: vi.fn(),
  mapOrder: vi.fn(),
  loadOrderConfig: vi.fn(),
}));

import { redispatchEvent } from './payment-ops.service';

function eventRow(overrides: Partial<PaymentEventRow> = {}): PaymentEventRow {
  return {
    id: 9,
    type: 'refund.succeeded',
    orderNo: 'PO-9',
    payload: '{}',
    status: 'failed',
    attempts: 5,
    generation: 1,
    redispatchCount: 0,
    lastError: 'subscriber failed',
    tenantId: null,
    createdAt: new Date('2026-10-24T01:00:00Z'),
    processedAt: new Date('2026-10-24T01:01:00Z'),
    ...overrides,
  };
}

function selectChain(rows: PaymentEventRow[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentUser.mockReturnValue({ userId: 1, tenantId: null, roles: [] });
  mocks.processEvent.mockResolvedValue(undefined);
  mocks.interruptAttempts.mockResolvedValue(undefined);
});

describe('redispatchEvent', () => {
  it('开启新轮次并保留旧尝试历史，完成后返回最新当前状态', async () => {
    const before = eventRow();
    const after = eventRow({ status: 'done', attempts: 1, generation: 2, redispatchCount: 1, lastError: null });
    mocks.select.mockReturnValueOnce(selectChain([before])).mockReturnValueOnce(selectChain([after]));

    const updateChain = { set: vi.fn(), where: vi.fn() };
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockResolvedValue([]);
    const tx = { update: mocks.update.mockReturnValue(updateChain) };
    mocks.transaction.mockImplementation(async (callback) => callback(tx as never));

    const result = await redispatchEvent(9);

    expect(mocks.interruptAttempts).toHaveBeenCalledWith(tx, 9, expect.any(Date), expect.stringContaining('手动重投'));
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      attempts: 0,
      lastError: null,
      processedAt: null,
      generation: expect.anything(),
      redispatchCount: expect.anything(),
    }));
    expect(mocks.processEvent).toHaveBeenCalledWith(9);
    expect(result).toMatchObject({ status: 'done', attempts: 1, generation: 2, redispatchCount: 1, lastError: null });
  });
});
