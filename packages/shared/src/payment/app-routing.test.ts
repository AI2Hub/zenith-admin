import { describe, expect, it } from 'vitest';
import { paymentAppBoundConfigIds } from './app-routing';

describe('paymentAppBoundConfigIds', () => {
  it('只返回应用实际绑定的商户配置', () => {
    expect([...paymentAppBoundConfigIds({
      wechatConfigId: 10,
      alipayConfigId: null,
      unionpayConfigId: 12,
    })]).toEqual([10, 12]);
    expect([...paymentAppBoundConfigIds(null)]).toEqual([]);
  });
});
