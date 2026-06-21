/**
 * 支付渠道适配器契约。
 *
 * 每个支付渠道（微信/支付宝/…）实现 `PaymentChannelAdapter` 接口，
 * 门面层（payment.service）通过 registry 拿到对应 adapter 调用，
 * 完全不感知渠道差异与签名细节。
 */
import type { CreatePaymentResult, PaymentChannel } from '@zenith/shared';
import type { PaymentChannelConfigRow, PaymentOrderRow, PaymentRefundRow } from '../../db/schema';

/** 已解密的渠道敏感凭据（仅在内存中存在，绝不落库/出参） */
export interface DecryptedSecrets {
  wechatApiV3Key?: string;
  wechatPrivateKey?: string;
  alipayPrivateKey?: string;
}

/** 适配器上下文：持有完整渠道配置 + 已解密凭据 + 回调地址 */
export interface AdapterContext {
  config: PaymentChannelConfigRow;
  secrets: DecryptedSecrets;
  /** 完整的异步通知回调地址（含渠道，如 https://host/api/public/payment/notify/wechat） */
  notifyUrl: string;
}

export interface PaymentQueryResult {
  status: 'pending' | 'success' | 'closed' | 'failed';
  channelTradeNo?: string;
  /** 实付金额（分） */
  paidAmount?: number;
  paidAt?: Date;
  raw?: unknown;
}

export interface RefundResult {
  channelRefundNo?: string;
  status: 'processing' | 'success' | 'failed';
  raw?: unknown;
}

export interface RefundQueryResult {
  status: 'processing' | 'success' | 'failed';
  channelRefundNo?: string;
  refundedAt?: Date;
  raw?: unknown;
}

/** 分账接收方（单笔分账目标） */
export interface ProfitShareReceiver {
  /** 接收方账号（商户号 / 个人 openid 等） */
  account: string;
  /** 分账金额（分） */
  amount: number;
  /** 接收方名称（备注用） */
  name?: string;
  /** 接收方类型 */
  receiverType?: 'merchant' | 'personal';
}

export interface ProfitShareResult {
  /** 渠道分账单号 */
  channelSharingNo?: string;
  status: 'processing' | 'success' | 'failed';
  raw?: unknown;
}

/** 回调验签 + 解析后的标准化结果 */
export interface NotifyResult {
  /** 验签是否通过 */
  valid: boolean;
  /** 通知场景：支付 / 退款 */
  scene: 'payment' | 'refund';
  /** 商户订单号（out_trade_no） */
  outTradeNo?: string;
  /** 渠道交易号 */
  channelTradeNo?: string;
  /** 商户退款单号（退款通知时） */
  outRefundNo?: string;
  channelRefundNo?: string;
  /** 标准化业务结果 */
  tradeStatus: 'success' | 'closed' | 'failed' | 'refunded' | 'unknown';
  /** 实付金额（分） */
  paidAmount?: number;
  paidAt?: Date;
  /** 需要回写给渠道的 ACK 响应 */
  ack: { body: string; contentType: string; status: number };
  message?: string;
  raw?: unknown;
}

export interface PaymentChannelAdapter {
  readonly channel: PaymentChannel;
  /** 下单：返回前端可直接使用的支付参数（二维码 / 跳转链接 / JSAPI 参数 / APP 调起串） */
  createPayment(ctx: AdapterContext, order: PaymentOrderRow): Promise<CreatePaymentResult>;
  /** 主动查询支付状态（回调兜底） */
  queryPayment(ctx: AdapterContext, order: PaymentOrderRow): Promise<PaymentQueryResult>;
  /** 关闭订单 */
  closePayment(ctx: AdapterContext, order: PaymentOrderRow): Promise<void>;
  /** 申请退款 */
  refund(ctx: AdapterContext, order: PaymentOrderRow, refund: PaymentRefundRow): Promise<RefundResult>;
  /** 查询退款状态 */
  queryRefund(ctx: AdapterContext, refund: PaymentRefundRow, order: PaymentOrderRow): Promise<RefundQueryResult>;
  /** 验签 + 解析异步回调 */
  verifyNotify(ctx: AdapterContext, rawBody: string, headers: Headers): Promise<NotifyResult>;
  /**
   * 发起单笔分账（可选）。
   * 渠道侧真实分账 API（微信「请求分账」、支付宝「分账请求」）需商户开通分账权限并签约接收方，
   * 此处提供模拟实现：生成渠道分账单号并即时返回成功，便于联调与演示。
   */
  profitShare?(ctx: AdapterContext, order: PaymentOrderRow, receiver: ProfitShareReceiver): Promise<ProfitShareResult>;
  /**
   * 连通性测试（可选）。
   * 向渠道发起一个轻量的探测请求（如查询一个不存在的订单号），
   * 用于验证商户凭据配置是否正确。"订单不存在"属预期结果，应正常返回；
   * 签名错误、鉴权失败等凭据问题则抛出异常。
   */
  testConnectivity?(ctx: AdapterContext): Promise<void>;
}
