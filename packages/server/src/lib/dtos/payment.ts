/**
 * 支付中心相关 DTO（密钥字段以 hasXxx 布尔位返回，绝不暴露明文）
 */
import { z } from '@hono/zod-openapi';

const channelEnum = z.enum(['wechat', 'alipay']);
const payMethodEnum = z.enum(['wechat_native', 'wechat_jsapi', 'wechat_h5', 'alipay_page', 'alipay_wap', 'alipay_app']);
const orderStatusEnum = z.enum(['pending', 'paying', 'success', 'closed', 'refunding', 'refunded', 'failed']);
const refundStatusEnum = z.enum(['pending', 'processing', 'success', 'failed']);

export const PaymentChannelConfigDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    channel: channelEnum,
    status: z.enum(['enabled', 'disabled']),
    isDefault: z.boolean(),
    sandbox: z.boolean(),
    notifyUrl: z.string().nullable().optional(),
    wechatAppId: z.string().nullable().optional(),
    wechatMchId: z.string().nullable().optional(),
    wechatSerialNo: z.string().nullable().optional(),
    wechatPlatformCert: z.string().nullable().optional(),
    hasWechatApiV3Key: z.boolean().optional(),
    hasWechatPrivateKey: z.boolean().optional(),
    alipayAppId: z.string().nullable().optional(),
    alipayPublicKey: z.string().nullable().optional(),
    alipaySignType: z.string().nullable().optional(),
    alipayGateway: z.string().nullable().optional(),
    hasAlipayPrivateKey: z.boolean().optional(),
    remark: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('PaymentChannelConfig');

export const PaymentOrderDTO = z
  .object({
    id: z.number().int(),
    orderNo: z.string(),
    outTradeNo: z.string(),
    channelTradeNo: z.string().nullable().optional(),
    bizType: z.string(),
    bizId: z.string(),
    subject: z.string(),
    body: z.string().nullable().optional(),
    amount: z.number().int().openapi({ description: '金额（分）', example: 9900 }),
    currency: z.string(),
    channel: channelEnum,
    channelConfigId: z.number().int().nullable().optional(),
    payMethod: payMethodEnum,
    status: orderStatusEnum,
    userId: z.number().int().nullable().optional(),
    openId: z.string().nullable().optional(),
    clientIp: z.string().nullable().optional(),
    departmentId: z.number().int().nullable().optional(),
    paidAmount: z.number().int().nullable().optional(),
    paidAt: z.string().nullable().optional(),
    expiredAt: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('PaymentOrder');

export const PaymentRefundDTO = z
  .object({
    id: z.number().int(),
    refundNo: z.string(),
    outRefundNo: z.string(),
    orderNo: z.string(),
    orderId: z.number().int().nullable().optional(),
    channelRefundNo: z.string().nullable().optional(),
    channel: channelEnum,
    refundAmount: z.number().int().openapi({ description: '退款金额（分）' }),
    totalAmount: z.number().int().openapi({ description: '原订单金额（分）' }),
    reason: z.string().nullable().optional(),
    status: refundStatusEnum,
    operatorId: z.number().int().nullable().optional(),
    refundedAt: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('PaymentRefund');

export const PaymentNotifyLogDTO = z
  .object({
    id: z.number().int(),
    channel: channelEnum,
    scene: z.string(),
    orderNo: z.string().nullable().optional(),
    signatureValid: z.boolean(),
    result: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .openapi('PaymentNotifyLog');

export const CreatePaymentResultDTO = z
  .object({
    orderNo: z.string(),
    payMethod: payMethodEnum,
    channel: channelEnum,
    codeUrl: z.string().optional(),
    payUrl: z.string().optional(),
    formHtml: z.string().optional(),
    jsapiParams: z.record(z.string(), z.string()).optional(),
    appOrderStr: z.string().optional(),
    expiredAt: z.string().optional(),
  })
  .openapi('CreatePaymentResult');

export const CreatePaymentResponseDTO = z
  .object({
    orderNo: z.string(),
    payParams: CreatePaymentResultDTO,
  })
  .openapi('CreatePaymentResponse');

export const PaymentRefundResultDTO = z
  .object({
    refundNo: z.string(),
    status: z.string(),
  })
  .openapi('PaymentRefundResult');
