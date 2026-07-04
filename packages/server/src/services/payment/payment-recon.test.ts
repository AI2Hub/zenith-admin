import { describe, expect, it } from 'vitest';
import { computeAdjustment, parseChannelBill } from './payment-recon.service';

describe('computeAdjustment - 对账差异调账推导', () => {
  it('金额不一致：渠道多于本地 → 差额入账(in)', () => {
    expect(computeAdjustment({ result: 'amount_diff', localAmount: 4900, channelAmount: 5000 })).toEqual({ direction: 'in', amount: 100 });
  });

  it('金额不一致：渠道少于本地 → 差额出账(out)', () => {
    expect(computeAdjustment({ result: 'amount_diff', localAmount: 5000, channelAmount: 4900 })).toEqual({ direction: 'out', amount: 100 });
  });

  it('金额不一致但差额为 0 → 无需调账', () => {
    expect(computeAdjustment({ result: 'amount_diff', localAmount: 5000, channelAmount: 5000 })).toBeNull();
  });

  it('渠道有本地无 → 按渠道金额入账(in)', () => {
    expect(computeAdjustment({ result: 'channel_only', localAmount: null, channelAmount: 8800 })).toEqual({ direction: 'in', amount: 8800 });
  });

  it('本地有渠道无 → 按本地金额出账(out)', () => {
    expect(computeAdjustment({ result: 'local_only', localAmount: 6600, channelAmount: null })).toEqual({ direction: 'out', amount: 6600 });
  });

  it('比对一致 → 无需调账', () => {
    expect(computeAdjustment({ result: 'matched', localAmount: 100, channelAmount: 100 })).toBeNull();
  });

  it('金额缺失时不产生调账', () => {
    expect(computeAdjustment({ result: 'amount_diff', localAmount: null, channelAmount: 100 })).toBeNull();
    expect(computeAdjustment({ result: 'channel_only', localAmount: null, channelAmount: null })).toBeNull();
    expect(computeAdjustment({ result: 'local_only', localAmount: null, channelAmount: null })).toBeNull();
  });
});

describe('parseChannelBill - 渠道账单解析（回归）', () => {
  it('跳过表头与空行并解析有效记录', () => {
    const text = '订单号,渠道交易号,金额(分),状态\nPAY1,42000001,9900,SUCCESS\n\nPAY2,,100,refunded';
    const out = parseChannelBill(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ orderNo: 'PAY1', channelTradeNo: '42000001', amount: 9900 });
    expect(out[1]).toMatchObject({ orderNo: 'PAY2', amount: 100, status: 'refunded' });
  });

  it('金额非整数分时抛出业务错误', () => {
    expect(() => parseChannelBill('PAY1,x,99.5,SUCCESS')).toThrowError();
  });
});
