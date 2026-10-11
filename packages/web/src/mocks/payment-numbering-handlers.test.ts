import { afterEach, describe, expect, it } from 'vitest';
import type { AnyOperation } from '@zenith/shared/core';
import { bizPayDemoContract } from '@zenith/shared/biz';
import { memberSelfContract } from '@zenith/shared/member';
import { paymentDisputeContract, paymentLinkContract, paymentLinkPublicContract, paymentOpsContract, paymentOrderContract,
  paymentPreauthContract, paymentRefundContract, paymentSettlementContract, paymentSharingContract, paymentSigningContract, paymentTransferContract } from '@zenith/shared/payment';
import { mockPaymentOrders, mockPaymentRefunds } from './data/payment';
import { mockPaymentContracts, mockVipRenewals } from './data/payment-contracts';
import { mockBizPayDemos } from './data/biz-pay-demo';
import { mockNumberingAllocations, mockNumberingCounters, mockNumberingRules } from './data/numbering';
import { paymentHandlers } from './handlers/payment';
import { paymentExtHandlers } from './handlers/payment-ext';
import { paymentBExtHandlers, mockPaymentLinks, mockPaymentSettlements, mockPaymentSharingOrders, mockPaymentTransfers, mockSettlementLines } from './handlers/payment-bext';
import { paymentContractHandlers } from './handlers/payment-contracts';
import { paymentPreauthHandlers, mockPaymentPreauths } from './handlers/payment-preauths';
import { paymentDisputeHandlers, mockPaymentDisputes } from './handlers/payment-disputes';
import { mockAccessToken } from './utils/auth';
import { bizPayDemoHandlers } from './handlers/biz-pay-demo';
import { memberFrontHandlers } from './handlers/member-front';

const handlers = [...paymentHandlers, ...paymentExtHandlers, ...paymentBExtHandlers, ...paymentContractHandlers, ...paymentPreauthHandlers, ...paymentDisputeHandlers, ...bizPayDemoHandlers, ...memberFrontHandlers];
const stores: unknown[][] = [mockPaymentOrders, mockPaymentRefunds, mockPaymentContracts, mockVipRenewals, mockPaymentPreauths, mockPaymentDisputes,
  mockPaymentLinks, mockPaymentSettlements, mockPaymentSharingOrders, mockPaymentTransfers, mockSettlementLines, mockNumberingAllocations, mockNumberingCounters, mockNumberingRules, mockBizPayDemos];
const snapshots = stores.map(store => structuredClone(store));
afterEach(() => { stores.forEach((store, index) => { store.splice(0, store.length, ...structuredClone(snapshots[index]!)); }); });

async function call(operation: AnyOperation, body: unknown = {}, options: { params?: Record<string, string | number>; query?: Record<string, string | number>; key?: string } = {}) {
  let path = operation.fullPath;
  for (const [key, value] of Object.entries(options.params ?? {})) path = path.replace(`{${key}}`, String(value));
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value));
  const headers = new Headers({ 'content-type': 'application/json', authorization: `Bearer ${mockAccessToken('admin')}` });
  if (options.key) headers.set('x-idempotency-key', options.key);
  const request = new Request(url, { method: operation.method.toUpperCase(), headers,
    ...(operation.method === 'get' ? {} : { body: JSON.stringify(body) }) });
  for (const handler of handlers) {
    const result = await (handler as unknown as { run: (args: unknown) => Promise<{ response?: Response } | null> }).run({ request, requestId: crypto.randomUUID() });
    if (result?.response) return { status: result.response.status, body: await result.response.json() };
  }
  throw new Error(`Missing handler: ${path}`);
}

const orderInput = { applicationId: 1, payMethod: 'wechat_native', bizType: 'numbering_test', bizId: 'test-order', subject: '编号测试订单', amount: 8000 };
async function paidOrder() {
  const result = await call(paymentOrderContract.createOrder, orderInput);
  const order = mockPaymentOrders.find(item => item.orderNo === result.body.data.orderNo)!;
  await call(paymentOpsContract.simulateOrderPaid, {}, { params: { id: order.id } });
  return order;
}
function allocation(scene: string) { return mockNumberingAllocations.filter(item => item.scene === scene); }

describe('payment numbering through Demo APIs', () => {
  it('reuses the numbered payment order for business payment retries and fulfills from that order', async () => {
    const created = await call(bizPayDemoContract.create, { subject: '业务支付示例编号', amount: 3000 });
    const id = created.body.data.id;
    const options = { params: { id } };
    const input = { applicationId: 1, payMethod: 'wechat_native' };
    const first = await call(bizPayDemoContract.pay, input, options);
    const retry = await call(bizPayDemoContract.pay, input, options);
    expect(first.status).toBe(200); expect(retry.body.data.payParams.orderNo).toBe(first.body.data.payParams.orderNo);
    const order = mockPaymentOrders.find(item => item.orderNo === first.body.data.payParams.orderNo)!;
    expect(order).toMatchObject({ bizType: 'biz_pay_demo', bizId: String(id), amount: 3000, status: 'paying' });
    expect(allocation('payment.order')).toEqual([expect.objectContaining({ number: order.orderNo, businessKey: String(order.id) })]);
    const paid = await call(bizPayDemoContract.simulatePaid, {}, options);
    expect(paid.body.data.status).toBe('paid'); expect(order.status).toBe('success'); expect(order.paidAmount).toBe(3000);
    expect((await call(bizPayDemoContract.simulatePaid, {}, options)).body.data.paymentOrderNo).toBe(order.orderNo);
    expect(allocation('payment.order')).toHaveLength(1);
  });

  it('creates member recharge orders through the center and reuses the active recharge on retry', async () => {
    const input = { applicationId: 3, payMethod: 'alipay_wap', amount: 5000 };
    expect((await call(memberSelfContract.recharge, { ...input, applicationId: 1 })).body.code).toBe(400);
    expect(mockNumberingAllocations).toHaveLength(0);
    const first = await call(memberSelfContract.recharge, input);
    const retry = await call(memberSelfContract.recharge, input);
    expect(first.status).toBe(200); expect(retry.body.data.orderNo).toBe(first.body.data.orderNo);
    const order = mockPaymentOrders.find(item => item.orderNo === first.body.data.orderNo)!;
    expect(order).toMatchObject({ bizType: 'member_recharge', appId: 3, channel: 'alipay', amount: 5000, status: 'paying' });
    expect(allocation('payment.order')[0]).toMatchObject({ number: order.orderNo, businessKey: String(order.id) });
    expect((await call(memberSelfContract.recharge, { ...input, amount: 6000 })).body.code).toBe(409);
    expect(allocation('payment.order')).toHaveLength(1);
  });

  it('attaches a payment number to its order and preserves request idempotency', async () => {
    const key = crypto.randomUUID();
    const created = await call(paymentOrderContract.createOrder, orderInput, { key });
    const retry = await call(paymentOrderContract.createOrder, orderInput, { key });
    expect(created.status).toBe(200); expect(retry.body.data).toEqual(created.body.data);
    const order = mockPaymentOrders.find(item => item.orderNo === created.body.data.orderNo)!;
    expect(allocation('payment.order')).toEqual([expect.objectContaining({ number: order.orderNo, businessKey: String(order.id), allocationKey: `app:1:request:${key}` })]);
    expect((await call(paymentOrderContract.createOrder, { ...orderInput, amount: 8100 }, { key })).status).toBe(409);
    expect(allocation('payment.order')).toHaveLength(1);
  });

  it('keeps a refund number on retries and rejects excess refunds before allocation', async () => {
    const order = await paidOrder();
    const key = crypto.randomUUID();
    const body = { orderNo: order.orderNo, refundAmount: 2000, reason: '部分退款' };
    const first = await call(paymentRefundContract.createRefund, body, { key });
    expect(first.status).toBe(200);
    expect((await call(paymentRefundContract.createRefund, body, { key })).body.data).toEqual(first.body.data);
    expect((await call(paymentRefundContract.createRefund, { ...body, refundAmount: 2500 }, { key })).status).toBe(409);
    const refund = mockPaymentRefunds.find(item => item.refundNo === first.body.data.refundNo)!;
    expect(allocation('payment.refund')[0]).toMatchObject({ businessKey: String(refund.id), allocationKey: `order:${order.id}:request:${key}` });
    const counters = structuredClone(mockNumberingCounters);
    const failed = await call(paymentRefundContract.createRefund, { ...body, refundAmount: 7000 }, { key: crypto.randomUUID() });
    expect(failed.body.code).toBe(400); expect(mockNumberingCounters).toEqual(counters); expect(allocation('payment.refund')).toHaveLength(1);
  });

  it('allocates a real capture order, keeps its number on retry and rejects changed amounts', async () => {
    const created = await call(paymentPreauthContract.create, { applicationId: 1, payMethod: 'wechat_preauth', payerAccount: 'payer', subject: '押金', frozenAmount: 10000, bizId: 'hotel-1' });
    const id = created.body.data.id;
    expect(allocation('payment.preauth')[0]?.businessKey).toBe(String(id));
    const options = { params: { id }, query: { applicationId: 1 } };
    const count = mockNumberingAllocations.length;
    expect((await call(paymentPreauthContract.capture, { captureAmount: 11000 }, options)).body.code).toBe(400);
    expect(mockNumberingAllocations).toHaveLength(count);
    const captured = await call(paymentPreauthContract.capture, { captureAmount: 6000 }, options);
    const order = mockPaymentOrders.find(item => item.orderNo === captured.body.data.captureOrderNo)!;
    expect(order.amount).toBe(6000);
    expect(allocation('payment.capture')[0]).toMatchObject({ number: order.orderNo, businessKey: String(order.id), allocationKey: `preauth:${id}` });
    expect((await call(paymentPreauthContract.capture, { captureAmount: 6000 }, options)).body.data.captureOrderNo).toBe(order.orderNo);
    expect((await call(paymentPreauthContract.capture, { captureAmount: 7000 }, options)).status).toBe(409);
    expect(allocation('payment.capture')).toHaveLength(1);
  });

  it('allocates deductions per contract period and rolls back a failed first deduction together with the contract', async () => {
    const input = { applicationId: 1, planId: 1, payMethod: 'wechat_papay', signerAccount: 'payer', firstDeductNow: false };
    const created = await call(paymentSigningContract.createContract, input);
    const contract = mockPaymentContracts.find(item => item.id === created.body.data.contract.id)!;
    expect(allocation('payment.contract')[0]?.businessKey).toBe(String(contract.id));
    const options = { params: { id: contract.id }, query: { applicationId: 1 } };
    expect((await call(paymentSigningContract.deductContract, {}, options)).status).toBe(200);
    expect((await call(paymentSigningContract.deductContract, {}, options)).status).toBe(200);
    expect(allocation('payment.deduction').map(item => item.allocationKey)).toEqual([`contract:${contract.id}:period:1`, `contract:${contract.id}:period:2`]);
    for (const row of allocation('payment.deduction')) expect(mockPaymentOrders.find(item => String(item.id) === row.businessKey)?.orderNo).toBe(row.number);
    mockNumberingRules.find(item => item.scene === 'payment.deduction')!.status = 'disabled';
    const before = stores.map(store => structuredClone(store));
    expect((await call(paymentSigningContract.createContract, { ...input, firstDeductNow: true })).body.code).toBe(409);
    stores.forEach((store, index) => { expect(store).toEqual(before[index]); });
  });

  it('uses the center for transfers, settlements, sharing, payment links and public payment orders', async () => {
    const transferKey = crypto.randomUUID();
    const transferBody = { applicationId: 1, channel: 'wechat', receiverAccount: 'payer', amount: 1000, remark: '测试' };
    const transfer = await call(paymentTransferContract.create, transferBody, { key: transferKey });
    expect(transfer.status).toBe(200); expect(allocation('payment.transfer')[0]?.businessKey).toBe(String(transfer.body.data.id));
    expect((await call(paymentTransferContract.create, transferBody, { key: transferKey })).body.data.transferNo).toBe(transfer.body.data.transferNo);
    const settlement = await call(paymentSettlementContract.generate, { applicationId: 1, channelConfigId: 1, periodStart: '2024-01-15', periodEnd: '2024-01-15', currency: 'CNY' });
    expect(settlement.status).toBe(200); expect(allocation('payment.settlement')[0]?.businessKey).toBe(String(settlement.body.data.id));
    const order = await paidOrder();
    const share = await call(paymentSharingContract.dispatch, { orderNo: order.orderNo, receiverId: 1, amount: 500 });
    expect(share.status).toBe(200); expect(allocation('payment.sharing')[0]?.businessKey).toBe(String(share.body.data.id));
    const link = await call(paymentLinkContract.create, { applicationId: 1, subject: '链接编号测试', amount: 2000, bizType: 'test' });
    expect(link.status).toBe(200); expect(allocation('payment.link')[0]?.businessKey).toBe(String(link.body.data.id));
    const cashier = await call(paymentLinkPublicContract.pay, { payMethod: 'wechat_native' }, { params: { token: link.body.data.token } });
    expect(cashier.status).toBe(200);
    const publicOrder = mockPaymentOrders.find(item => item.orderNo === cashier.body.data.orderNo)!;
    expect(publicOrder.bizId).toMatch(new RegExp(`^link:${link.body.data.id}:session:\\d+$`));
    expect(allocation('payment.order').find(item => item.number === publicOrder.orderNo)?.businessKey).toBe(String(publicOrder.id));
  });

  it('creates numbered complaints and uses a real numbered refund for complaint refund actions', async () => {
    const order = await paidOrder();
    const dispute = await call(paymentDisputeContract.simulate, { orderNo: order.orderNo });
    expect(dispute.status).toBe(200);
    expect(allocation('payment.dispute')[0]?.businessKey).toBe(String(dispute.body.data.id));
    const refunded = await call(paymentDisputeContract.refund, { refundAmount: 2000 }, { params: { id: dispute.body.data.id } });
    expect(refunded.status).toBe(200);
    const refund = mockPaymentRefunds.find(item => item.refundNo === refunded.body.data.refundNo)!;
    expect(allocation('payment.refund')[0]?.businessKey).toBe(String(refund.id));
  });
});
