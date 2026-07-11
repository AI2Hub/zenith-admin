/**
 * 积分记账纯计算逻辑单测（纯函数，无 DB 依赖）。
 *
 * 测试 `computePointChange`，覆盖：增加、扣减、恰好扣完、超扣防护、累计统计方向。
 * 另测试 `changePoints`：事务提交后按交易类型触发对应服务端权威事件（member.points.*），
 * 失败（透支）时不触发；properties 仅含标量业务字段。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

vi.mock('../../db', () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    $count: vi.fn(),
    transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
    query: {
      memberPointTransactions: { findMany: vi.fn() },
    },
  };
  return { db };
});

vi.mock('../../lib/member-context', () => ({
  currentMemberId: vi.fn().mockReturnValue(7),
}));

// 服务端权威事件为 best-effort 异步旁路，unit test 中整体 mock 掉。
vi.mock('../analytics/analytics-server-events.service', () => ({
  trackServerEvent: vi.fn(),
}));

import { db } from '../../db';
import { trackServerEvent } from '../analytics/analytics-server-events.service';
import { computePointChange, changePoints } from './member-points.service';

const dbMock = vi.mocked(db);
const trackServerEventMock = vi.mocked(trackServerEvent);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createChain(result: unknown[]): any {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('computePointChange', () => {
  const acc = { balance: 100, totalEarned: 100, totalSpent: 0 };

  it('增加积分：余额与累计获得同步增加，累计消耗不变', () => {
    expect(computePointChange(acc, 50)).toEqual({ newBalance: 150, newTotalEarned: 150, newTotalSpent: 0 });
  });

  it('扣减积分：余额减少，累计消耗增加（取绝对值），累计获得不变', () => {
    expect(computePointChange(acc, -30)).toEqual({ newBalance: 70, newTotalEarned: 100, newTotalSpent: 30 });
  });

  it('恰好扣完：余额为 0（边界允许）', () => {
    expect(computePointChange(acc, -100)).toEqual({ newBalance: 0, newTotalEarned: 100, newTotalSpent: 100 });
  });

  it('超扣 1 分：抛 400 防止透支', () => {
    expect(() => computePointChange(acc, -101)).toThrow(HTTPException);
  });

  it('从 0 余额扣减：抛错', () => {
    expect(() => computePointChange({ balance: 0, totalEarned: 0, totalSpent: 0 }, -1)).toThrow();
  });

  it('大额累计正确累加', () => {
    expect(computePointChange({ balance: 1000, totalEarned: 5000, totalSpent: 4000 }, 2000)).toEqual({
      newBalance: 3000,
      newTotalEarned: 7000,
      newTotalSpent: 4000,
    });
  });
});

// ─── changePoints：服务端权威事件按交易类型映射 ───────────────────────────────
describe('changePoints - 服务端权威事件', () => {
  const acc = { id: 1, memberId: 7, balance: 100, totalEarned: 100, totalSpent: 0, version: 3 };

  beforeEach(() => {
    vi.resetAllMocks();
    dbMock.transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  it('earn 成功 → 触发 member.points.earned，properties 仅含标量字段', async () => {
    dbMock.select.mockReturnValueOnce(createChain([acc]));
    dbMock.update.mockReturnValueOnce(createChain([{ ...acc, balance: 150, totalEarned: 150, version: 4 }]));
    dbMock.insert.mockReturnValueOnce(createChain([]));

    const result = await changePoints({ memberId: 7, type: 'earn', amount: 50, bizType: 'checkin', bizId: '2026-07-05' });

    expect(result.balance).toBe(150);
    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'member.points.earned',
        memberId: 7,
        tenantId: null,
        properties: { memberId: 7, amount: 50, balanceAfter: 150, bizType: 'checkin', bizId: '2026-07-05' },
      }),
    );
  });

  it('redeem 成功 → 触发 member.points.redeemed', async () => {
    dbMock.select.mockReturnValueOnce(createChain([acc]));
    dbMock.update.mockReturnValueOnce(createChain([{ ...acc, balance: 70, totalSpent: 30, version: 4 }]));
    dbMock.insert.mockReturnValueOnce(createChain([]));

    await changePoints({ memberId: 7, type: 'redeem', amount: -30, bizType: 'coupon_exchange' });

    expect(trackServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'member.points.redeemed', properties: expect.objectContaining({ amount: -30 }) }),
    );
  });

  it('adjust 成功 → 触发 member.points.adjusted', async () => {
    dbMock.select.mockReturnValueOnce(createChain([acc]));
    dbMock.update.mockReturnValueOnce(createChain([{ ...acc, balance: 120, version: 4 }]));
    dbMock.insert.mockReturnValueOnce(createChain([]));

    await changePoints({ memberId: 7, type: 'adjust', amount: 20, operatorId: 1 });

    expect(trackServerEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'member.points.adjusted' }));
  });

  it('账户不存在（404）→ 不触发事件', async () => {
    dbMock.select.mockReturnValueOnce(createChain([]));
    await expect(changePoints({ memberId: 7, type: 'earn', amount: 10 })).rejects.toMatchObject({ status: 404 });
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });

  it('余额不足透支（400）→ 不触发事件', async () => {
    dbMock.select.mockReturnValueOnce(createChain([{ ...acc, balance: 5 }]));
    await expect(changePoints({ memberId: 7, type: 'redeem', amount: -10 })).rejects.toMatchObject({ status: 400 });
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });
});
