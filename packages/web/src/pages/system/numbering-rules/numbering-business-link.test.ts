import { describe, expect, it } from 'vitest';
import { canonicalEntityDetailRoute } from '@zenith/shared/platform';
import { numberingBusinessRef } from './numbering-business-link';

describe('编号关联业务精确详情', () => {
  it('支付编号通过已注册详情路由打开关联记录', () => {
    const ref = numberingBusinessRef({ scene: 'payment.order', businessKey: '42' }, permission => permission === 'payment:order:list');
    expect(ref && canonicalEntityDetailRoute(ref)).toBe('/payment/orders?orderId=42');
  });
  it('无业务权限、没有成熟入口或非实体 ID 时不展示链接', () => {
    expect(numberingBusinessRef({ scene: 'payment.order', businessKey: '42' }, () => false)).toBeUndefined();
    expect(numberingBusinessRef({ scene: 'payment.transfer', businessKey: '42' }, () => true)).toBeUndefined();
    expect(numberingBusinessRef({ scene: 'workflow.instance', businessKey: 'instance:42' }, () => true)).toBeUndefined();
  });
  it('扣款与预授权转支付打开最终支付订单', () => {
    expect(numberingBusinessRef({ scene: 'payment.capture', businessKey: '31' }, () => true)).toEqual({ type: 'payment.order', key: '31' });
    expect(numberingBusinessRef({ scene: 'payment.deduction', businessKey: '32' }, () => true)).toEqual({ type: 'payment.order', key: '32' });
  });
});
