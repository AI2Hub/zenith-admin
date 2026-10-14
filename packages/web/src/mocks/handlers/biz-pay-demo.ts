import { bizPayDemoContract, type BizPayDemo } from '@zenith/shared/biz';
import { PAYMENT_METHOD_CHANNEL, type CreatePaymentResult } from '@zenith/shared/payment';
import { mockBizPayDemos, getNextPayDemoId } from '@/mocks/data/biz-pay-demo';
import { mock } from '@/mocks/utils/contract';
import { removeByIds, requireItem } from '@/mocks/utils/crud';
import { mockDateTime } from '@/mocks/utils/date';
import { badRequest } from '@/mocks/utils/handlers';
import { filterByKeyword } from '@/mocks/utils/filter';
import { mockPaymentChannels, mockPaymentOrders } from '@/mocks/data/payment';
import { withMockNumberingTransaction } from '@/mocks/utils/numbering';
import { createNumberedMockPaymentOrder } from '@/mocks/utils/payment-numbering';
import { recordMockPaymentSucceeded } from './payment-ext';

export const bizPayDemoHandlers = [
  mock(bizPayDemoContract.list, ({ query, ok, paginate }) => {
    const keyword = (query.keyword ?? '').trim().toLowerCase();
    let list = [...mockBizPayDemos].sort((a, b) => b.id - a.id);
    if (query.status) list = list.filter((d) => d.status === query.status);
    if (keyword) list = filterByKeyword(list, keyword, [(d) => d.subject], { caseInsensitive: true });
    return ok(paginate(list));
  }),

  mock(bizPayDemoContract.detail, ({ params, ok }) => {
    const demo = requireItem(mockBizPayDemos, params.id, '示例单不存在');
    return ok(demo);
  }),

  mock(bizPayDemoContract.create, ({ body, ok }) => {
    const now = mockDateTime();
    const demo: BizPayDemo = {
      id: getNextPayDemoId(),
      subject: body.subject,
      amount: body.amount,
      payMethod: null,
      status: 'pending',
      paymentOrderNo: null,
      paidAt: null,
      fulfillRemark: null,
      tenantId: 1,
      createdAt: now,
      updatedAt: now,
    };
    mockBizPayDemos.unshift(demo);
    return ok(demo, '创建成功');
  }),

  mock(bizPayDemoContract.remove, ({ params, ok }) => {
    const item = requireItem(mockBizPayDemos, params.id, '示例单不存在');
    if (item.status === 'paid') return badRequest('已支付的示例单不可删除');
    removeByIds(mockBizPayDemos, [params.id]);
    return ok(null, '已删除');
  }),

  // 发起支付：返回二维码/跳转链接，并置「支付中」
  mock(bizPayDemoContract.pay, ({ params, body, ok }) => {
    const demo = requireItem(mockBizPayDemos, params.id, '示例单不存在');
    if (demo.status === 'paid') return badRequest('该示例单已支付，无需重复发起');
    const payMethod = body.payMethod;
    const channel = PAYMENT_METHOD_CHANNEL[payMethod];
    const configId = body.applicationId === 3 && channel === 'alipay' ? 2
      : (body.applicationId === 1 || body.applicationId === 2) && channel === 'wechat' ? 1 : null;
    const config = mockPaymentChannels.find(item => item.id === configId && item.status === 'enabled');
    if (!config) return badRequest('支付应用未绑定所选支付方式对应的商户配置');
    const existing = demo.paymentOrderNo ? mockPaymentOrders.find(item => item.orderNo === demo.paymentOrderNo && ['pending', 'paying'].includes(item.status)) : undefined;
    if (existing && (existing.appId !== body.applicationId || existing.payMethod !== payMethod || existing.amount !== demo.amount)) {
      return badRequest('该示例单已有不同支付参数的处理中订单');
    }
    const order = withMockNumberingTransaction(() => {
      const order = existing ?? createNumberedMockPaymentOrder({ scene: 'payment.order',
        allocationKey: `app:${body.applicationId}:request:${crypto.randomUUID()}`, values: {
          appId: body.applicationId, channel, channelConfigId: config.id, channelAccountId: config.id, credentialVersion: 1,
          payMethod, bizType: 'biz_pay_demo', bizId: String(demo.id), subject: demo.subject, body: null,
          amount: demo.amount, currency: 'CNY', status: 'paying', userId: 1, openId: body.openId ?? null,
          channelTradeNo: null, clientIp: '127.0.0.1', departmentId: null, paidAmount: null, feeAmount: null, netAmount: null,
          paidAt: null, expiredAt: null, errorMessage: null, version: 0,
        } });
      demo.status = 'paying';
      demo.payMethod = payMethod;
      demo.paymentOrderNo = order.orderNo;
      demo.updatedAt = mockDateTime();
      return order;
    }, [mockBizPayDemos, mockPaymentOrders]);
    const orderNo = order.orderNo;
    const payParams: CreatePaymentResult = {
      orderNo,
      payMethod,
      channel,
      ...(channel === 'wechat'
        ? { codeUrl: `weixin://wxpay/bizpayurl?pr=DEMO${demo.id}` }
        : { payUrl: `https://example.com/mock-alipay/pay?orderNo=${orderNo}` }),
    };
    return ok({ demo, payParams }, '下单成功');
  }),

  // 模拟支付成功：履约（置 paid + 发放权益）
  mock(bizPayDemoContract.simulatePaid, ({ params, ok }) => {
    const demo = requireItem(mockBizPayDemos, params.id, '示例单不存在');
    if (!demo.paymentOrderNo) return badRequest('请先创建支付订单');
    if (demo.status === 'paid') return ok(demo, '已模拟支付成功');
    const order = mockPaymentOrders.find(item => item.orderNo === demo.paymentOrderNo);
    if (!order) return badRequest('关联支付订单不存在');
    if (!['pending', 'paying', 'success'].includes(order.status)) return badRequest('关联支付订单当前状态不可模拟成功');
    withMockNumberingTransaction(() => {
      const now = mockDateTime();
      order.status = 'success';
      order.paidAmount = order.amount;
      order.paidAt ??= now;
      order.updatedAt = now;
      order.version += 1;
      demo.status = 'paid';
      demo.paidAt = now;
      demo.fulfillRemark = '支付成功，已自动发放示例权益（演示履约）';
      demo.updatedAt = now;
    }, [mockBizPayDemos, mockPaymentOrders]);
    recordMockPaymentSucceeded(order);
    return ok(demo, '已模拟支付成功');
  }),
];
