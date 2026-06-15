/**
 * 支付事件订阅者：监听支付/退款成功事件，通过 WebSocket 实时推送给付款用户。
 * 业务模块（履约/发货/开通会员）可在各自初始化处再追加 paymentEventBus.on(...)。
 */
import { paymentEventBus } from '../lib/payment-event-bus';
import { sendToUser } from '../lib/ws-manager';
import logger from '../lib/logger';

let registered = false;

export function registerPaymentSubscribers(): void {
  if (registered) return;
  registered = true;

  paymentEventBus.on('payment.succeeded', (e) => {
    logger.info('[payment] payment.succeeded', { orderNo: e.orderNo, bizType: e.bizType, bizId: e.bizId, amount: e.amount });
    const userId = e.userId;
    if (!userId) return;
    setImmediate(() => {
      sendToUser(userId, { type: 'payment:success', payload: { orderNo: e.orderNo, bizType: e.bizType, bizId: e.bizId, amount: e.amount } });
    });
  });

  paymentEventBus.on('refund.succeeded', (e) => {
    logger.info('[payment] refund.succeeded', { orderNo: e.orderNo, refundNo: e.refundNo });
    const userId = e.userId;
    const refundNo = e.refundNo;
    if (!userId || !refundNo) return;
    const refundAmount = e.refundAmount ?? 0;
    setImmediate(() => {
      sendToUser(userId, { type: 'payment:refunded', payload: { orderNo: e.orderNo, refundNo, refundAmount } });
    });
  });

  logger.info('Payment event subscribers registered');
}
