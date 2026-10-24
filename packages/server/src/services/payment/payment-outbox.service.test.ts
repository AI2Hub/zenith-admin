/**
 * 支付事件 Outbox 服务单测（履约事件可靠投递，资金一致性关键）。
 *
 * 覆盖要点：
 *  1. recordEvent：事务内原子落库（payload JSON 化、status=pending）
 *  2. processEvent：条件 claim（pending + 未超限 + 未被占用）未命中直接返回；
 *     投递成功置 done；失败 attempts+1 保持 pending 可重试（processedAt 清空）；
 *     达重试上限（5）置 failed 终态
 *  3. dispatchPendingPaymentEvents：cron 兜底扫描补投，返回扫描数
 *
 * Mock 策略：db / payment-event-bus / logger mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db', () => {
  const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
  return { db };
});

vi.mock('../../lib/payment-event-bus', () => ({
  paymentEventBus: { dispatch: vi.fn(), emit: vi.fn(), on: vi.fn() },
}));

vi.mock('../../lib/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { db } from '../../db';
import { paymentEventBus } from '../../lib/payment-event-bus';
import { recordEvent, processEvent, dispatchPendingPaymentEvents } from './payment-outbox.service';
import type { PaymentEventRow } from '../../db/schema';

const dbMock = vi.mocked(db);
const dispatchMock = vi.mocked(paymentEventBus.dispatch);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createChain(result: unknown[]): any {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'onConflictDoNothing']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeEventRow(overrides: Partial<PaymentEventRow> = {}): PaymentEventRow {
  return {
    id: 100,
    type: 'payment.succeeded',
    orderNo: 'PO-1',
    payload: JSON.stringify({ type: 'payment.succeeded', orderNo: 'PO-1', bizType: 'member_recharge' }),
    status: 'pending',
    attempts: 0,
    generation: 1,
    redispatchCount: 0,
    lastError: null,
    processedAt: null,
    tenantId: null,
    createdAt: new Date('2026-07-05T10:00:00'),
    ...overrides,
  } as PaymentEventRow;
}

beforeEach(() => {
  vi.resetAllMocks();
  dispatchMock.mockResolvedValue(undefined);
  dbMock.update.mockImplementation(() => createChain([]));
  dbMock.insert.mockImplementation(() => createChain([]));
  dbMock.transaction.mockImplementation(async (callback) => callback(dbMock as never));
});

function queueClaim(row: PaymentEventRow, attemptId = 501) {
  const claimChain = createChain([row]);
  const interruptedChain = createChain([]);
  const insertChain = createChain([{ id: attemptId }]);
  dbMock.update.mockReturnValueOnce(claimChain).mockReturnValueOnce(interruptedChain);
  dbMock.insert.mockReturnValueOnce(insertChain);
  return { claimChain, insertChain };
}

function queueFinish(attemptId = 501) {
  const attemptChain = createChain([{ id: attemptId }]);
  const eventChain = createChain([]);
  dbMock.update.mockReturnValueOnce(attemptChain).mockReturnValueOnce(eventChain);
  return { attemptChain, eventChain };
}

describe('recordEvent', () => {
  it('事务内插入 pending 事件，payload JSON 序列化，返回事件 id', async () => {
    const insertChain = createChain([{ id: 7 }]);
    const tx = { insert: vi.fn(() => insertChain) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await recordEvent(tx as any, {
      type: 'payment.succeeded',
      orderNo: 'PO-9',
      payload: { type: 'payment.succeeded', orderNo: 'PO-9', bizType: 'demo', amount: 100, currency: 'CNY', tenantId: null,
        subjectRefs: [{ type: 'payment.order', key: '9', role: 'primary' }] } as Parameters<typeof recordEvent>[1]['payload'],
      tenantId: null,
    });

    expect(id).toBe(7);
    const values = insertChain.values.mock.calls[0][0];
    expect(values.status).toBe('pending');
    expect(JSON.parse(values.payload)).toMatchObject({ orderNo: 'PO-9' });
  });
});

describe('processEvent', () => {
  it('claim 未命中（已被处理/超限/占用中）→ 直接返回不投递', async () => {
    dbMock.update.mockReturnValueOnce(createChain([])).mockReturnValueOnce(createChain([]));
    await processEvent(100);
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(dbMock.update).toHaveBeenCalledTimes(2);
  });

  it('claim 成功 + 投递成功 → 记录成功尝试、置 done 并清空当前错误', async () => {
    const { insertChain } = queueClaim(makeEventRow({ attempts: 1, lastError: '旧错误' }));
    const { attemptChain, eventChain } = queueFinish();

    await processEvent(100);

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderNo: 'PO-1', eventId: 'payment-outbox-100', occurredAt: expect.any(String) }),
    );
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ eventId: 100, generation: 1, attemptNo: 1, status: 'processing' }));
    expect(attemptChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', errorMessage: null }));
    expect(eventChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'done', lastError: null }));
  });

  it('投递失败（未达上限）→ 记录失败尝试并保持 pending', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('subscriber boom'));
    queueClaim(makeEventRow({ attempts: 2 }));
    const { attemptChain, eventChain } = queueFinish();

    await processEvent(100);

    expect(attemptChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', errorMessage: 'subscriber boom' }));
    expect(eventChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', lastError: 'subscriber boom', processedAt: null }));
  });

  it('投递失败达重试上限（5）→ 置 failed 终态', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('still down'));
    queueClaim(makeEventRow({ attempts: 5 }));
    const { eventChain } = queueFinish();

    await processEvent(100);

    expect(eventChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', processedAt: expect.any(Date) }));
  });

  it('崩溃尝试已耗尽时收敛为 failed 并结束 processing 历史', async () => {
    const exhaustedChain = createChain([{ id: 100, generation: 1 }]);
    const interruptedChain = createChain([]);
    dbMock.update
      .mockReturnValueOnce(createChain([]))
      .mockReturnValueOnce(exhaustedChain)
      .mockReturnValueOnce(interruptedChain);

    await processEvent(100);

    expect(exhaustedChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', lastError: expect.stringContaining('最大尝试次数') }));
    expect(interruptedChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', finishedAt: expect.any(Date) }));
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('错误消息截断至 500 字符（防超长报错撑爆列）', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('x'.repeat(600)));
    queueClaim(makeEventRow({ attempts: 1 }));
    const { attemptChain, eventChain } = queueFinish();

    await processEvent(100);

    expect(attemptChain.set.mock.calls[0][0].errorMessage).toHaveLength(500);
    expect(eventChain.set.mock.calls[0][0].lastError).toHaveLength(500);
  });
});

describe('dispatchPendingPaymentEvents', () => {
  it('无待投事件 → 返回 0', async () => {
    dbMock.select.mockReturnValueOnce(createChain([]));
    expect(await dispatchPendingPaymentEvents()).toBe(0);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('逐条补投 pending 事件并返回扫描条数', async () => {
    dbMock.select.mockReturnValueOnce(createChain([{ id: 1 }, { id: 2 }]));
    queueClaim(makeEventRow({ id: 1, attempts: 1 }), 501);
    queueFinish(501);
    queueClaim(makeEventRow({ id: 2, attempts: 1 }), 502);
    queueFinish(502);

    expect(await dispatchPendingPaymentEvents()).toBe(2);
    expect(dispatchMock).toHaveBeenCalledTimes(2);
  });
});
