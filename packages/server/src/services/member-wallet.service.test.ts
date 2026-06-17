/**
 * 钱包记账纯计算逻辑单测（纯函数，无 DB 依赖）。
 *
 * 测试 `computeWalletChange`：充值/消费/退款/调整的余额与累计统计、防超扣。金额单位为分。
 * 重点验证 totalRecharge/totalConsume 仅在对应 type 下累计（退款、调整不污染累计）。
 */
import { describe, it, expect } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { computeWalletChange } from './member-wallet.service';

describe('computeWalletChange', () => {
  const w = { balance: 5000, totalRecharge: 10000, totalConsume: 5000 };

  it('充值入账：余额与累计充值增加，累计消费不变', () => {
    expect(computeWalletChange(w, 'recharge', 3000)).toEqual({
      newBalance: 8000,
      newTotalRecharge: 13000,
      newTotalConsume: 5000,
    });
  });

  it('消费扣款：余额减少，累计消费增加（取绝对值）', () => {
    expect(computeWalletChange(w, 'consume', -2000)).toEqual({
      newBalance: 3000,
      newTotalRecharge: 10000,
      newTotalConsume: 7000,
    });
  });

  it('退款入账：余额增加，但不计入累计充值', () => {
    expect(computeWalletChange(w, 'refund', 1000)).toEqual({
      newBalance: 6000,
      newTotalRecharge: 10000,
      newTotalConsume: 5000,
    });
  });

  it('后台调增：余额增加，累计充值/消费均不变', () => {
    expect(computeWalletChange(w, 'adjust', 500)).toEqual({
      newBalance: 5500,
      newTotalRecharge: 10000,
      newTotalConsume: 5000,
    });
  });

  it('后台调减：余额减少，累计消费不变（仅 consume 类型才计入）', () => {
    expect(computeWalletChange(w, 'adjust', -500)).toEqual({
      newBalance: 4500,
      newTotalRecharge: 10000,
      newTotalConsume: 5000,
    });
  });

  it('恰好扣完：余额为 0', () => {
    expect(computeWalletChange(w, 'consume', -5000).newBalance).toBe(0);
  });

  it('超额消费 1 分：抛 400 防止透支', () => {
    expect(() => computeWalletChange(w, 'consume', -5001)).toThrow(HTTPException);
  });

  it('退款类型即使为正也不累计 totalRecharge', () => {
    expect(computeWalletChange({ balance: 0, totalRecharge: 0, totalConsume: 0 }, 'refund', 1000).newTotalRecharge).toBe(0);
  });
});
