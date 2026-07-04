/**
 * 支付接入示例的支付事件订阅者
 *
 * 监听 paymentEventBus 'payment.succeeded'，按 bizType 过滤本业务的支付成功事件后履约
 * （仿 payment-subscribers 中会员钱包充值入账）。订阅者自身幂等，兼容 at-least-once 投递。
 */
import { paymentEventBus } from '../../lib/payment-event-bus';
import logger from '../../lib/logger';
import { BIZ_PAY_DEMO_TYPE, markBizPayDemoPaid } from './biz-pay-demo.service';

let registered = false;

export function registerBizPayDemoSubscribers(): void {
  if (registered) return;
  registered = true;

  paymentEventBus.on('payment.succeeded', (e) => {
    if (e.bizType !== BIZ_PAY_DEMO_TYPE) return;
    return markBizPayDemoPaid({ bizId: e.bizId, orderNo: e.orderNo, amount: e.amount }).catch((err) => {
      logger.error('[biz-pay-demo] 支付成功履约失败', { orderNo: e.orderNo, err });
      throw err;
    });
  });

  logger.info('Biz-pay-demo payment subscribers registered');
}
