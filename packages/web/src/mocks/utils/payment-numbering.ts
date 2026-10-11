import type { PaymentOrder, PaymentRefund } from '@zenith/shared/payment';
import { getNextPaymentOrderId, getNextPaymentRefundId, mockPaymentOrders, mockPaymentRefunds } from '../data/payment';
import { MockHttpError } from './contract';
import { mockDateTime } from './date';
import { badRequest } from './handlers';
import { allocateMockBusinessNumber, attachMockBusinessNumber, withMockNumberingTransaction } from './numbering';

/** Payment channel references come from the simulated provider, independently of local numbering. */
export function mockChannelReference(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '')}`;
}

type NumberedOrderValues = Omit<PaymentOrder, 'id' | 'orderNo' | 'outTradeNo' | 'createdAt' | 'updatedAt'>;

export function createNumberedMockPaymentOrder(input: {
  scene: 'payment.order' | 'payment.deduction' | 'payment.capture';
  allocationKey: string;
  context?: Record<string, string | number>;
  values: NumberedOrderValues;
}): PaymentOrder {
  return withMockNumberingTransaction(() => {
    const number = allocateMockBusinessNumber({ scene: input.scene, tenantId: null, allocationKey: input.allocationKey,
      context: { appId: input.values.appId, amount: input.values.amount, currency: input.values.currency, ...input.context } });
    const existing = mockPaymentOrders.find(order => order.orderNo === number);
    if (existing) return existing;
    const now = mockDateTime();
    const order: PaymentOrder = { ...input.values, id: getNextPaymentOrderId(), orderNo: number, outTradeNo: number, createdAt: now, updatedAt: now };
    mockPaymentOrders.unshift(order);
    attachMockBusinessNumber({ scene: input.scene, tenantId: null, number, businessKey: String(order.id) });
    return order;
  }, [mockPaymentOrders]);
}

/** Shared by the normal refund API and complaint refunds; validates before allocating. */
export function createNumberedMockRefund(input: { order: PaymentOrder; amount: number; reason?: string; allocationKey: string }): PaymentRefund {
  const { order, amount } = input;
  if (!['success', 'refunding', 'refunded'].includes(order.status)) throw new MockHttpError(badRequest('仅支付成功的订单可退款'));
  const refunded = mockPaymentRefunds.filter(refund => refund.orderId === order.id && ['success', 'processing', 'pending'].includes(refund.status))
    .reduce((total, refund) => total + refund.refundAmount, 0);
  if (amount > (order.paidAmount ?? order.amount) - refunded) throw new MockHttpError(badRequest('退款金额超过订单剩余可退款金额'));
  return withMockNumberingTransaction(() => {
    const number = allocateMockBusinessNumber({ scene: 'payment.refund', tenantId: null, allocationKey: input.allocationKey,
      context: { orderId: order.id, amount, reason: input.reason?.trim() ?? '' } });
    const now = mockDateTime();
    const refund: PaymentRefund = { id: getNextPaymentRefundId(), refundNo: number, outRefundNo: number, orderNo: order.orderNo, orderId: order.id,
      channelAccountId: order.channelAccountId, credentialVersion: order.credentialVersion, channelRefundNo: mockChannelReference('CHANNELREF'),
      channel: order.channel, refundAmount: amount, totalAmount: order.amount, reason: input.reason ?? null, status: 'success', approvalStatus: 'none',
      operatorId: 1, refundedAt: now, errorMessage: null, version: 0, createdAt: now, updatedAt: now };
    mockPaymentRefunds.unshift(refund);
    order.status = refunded + amount >= (order.paidAmount ?? order.amount) ? 'refunded' : 'success';
    order.version += 1;
    order.updatedAt = now;
    attachMockBusinessNumber({ scene: 'payment.refund', tenantId: null, number, businessKey: String(refund.id) });
    return refund;
  }, [mockPaymentOrders, mockPaymentRefunds]);
}
