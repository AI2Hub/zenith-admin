/**
 * 积分记账纯计算逻辑单测（纯函数，无 DB 依赖）。
 *
 * 测试 `computePointChange`，覆盖：增加、扣减、恰好扣完、超扣防护、累计统计方向。
 */
import { describe, it, expect } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { computePointChange } from './member-points.service';

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
