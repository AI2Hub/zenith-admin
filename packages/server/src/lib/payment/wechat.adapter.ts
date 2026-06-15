/**
 * 微信支付 v3 适配器（Node 原生 crypto 实现真实签名/验签，外呼统一走 http-client）。
 *
 * 支持：Native 扫码 / JSAPI / H5；查单 / 关单 / 退款 / 退款查询 / 回调验签解密。
 * 文档：https://pay.weixin.qq.com/docs/merchant/apis/native-payment/
 */
import { randomBytes } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { httpGet, httpPost } from '../http-client';
import { formatDateTime } from '../datetime';
import logger from '../logger';
import type { CreatePaymentResult } from '@zenith/shared';
import { rsaSign, rsaVerify, aesGcmDecrypt, ensurePem } from './signing';
import { getPlatformCert } from './wechat-certs';
import type {
  AdapterContext,
  NotifyResult,
  PaymentChannelAdapter,
  PaymentQueryResult,
  RefundQueryResult,
  RefundResult,
} from './types';

const WECHAT_BASE = 'https://api.mch.weixin.qq.com';

function requireField<T>(v: T | null | undefined, name: string): T {
  if (v === null || v === undefined || v === '') throw new HTTPException(400, { message: `微信支付配置缺失：${name}` });
  return v;
}

function genNonce(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

function buildAuthToken(ctx: AdapterContext, method: string, urlPath: string, body: string): string {
  const mchid = requireField(ctx.config.wechatMchId, '商户号(mchId)');
  const serialNo = requireField(ctx.config.wechatSerialNo, '证书序列号(serialNo)');
  const privateKey = ensurePem(requireField(ctx.secrets.wechatPrivateKey, '商户私钥'), 'PRIVATE KEY');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = genNonce();
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(message, privateKey, 'RSA-SHA256');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

async function wechatRequest<T = Record<string, unknown>>(
  ctx: AdapterContext,
  method: 'GET' | 'POST',
  urlPath: string,
  bodyObj?: Record<string, unknown>,
): Promise<T> {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const authToken = buildAuthToken(ctx, method, urlPath, bodyStr);
  const headers: Record<string, string> = {
    Authorization: authToken,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'zenith-admin',
  };
  const url = `${WECHAT_BASE}${urlPath}`;
  const resp = method === 'GET' ? await httpGet(url, { headers }) : await httpPost(url, bodyStr, { headers });
  const text = await resp.text();
  if (!resp.ok) {
    logger.warn('[wechat-pay] api error', { urlPath, status: resp.status, body: text.slice(0, 500) });
    let msg = `微信支付接口错误(${resp.status})`;
    try {
      const e = JSON.parse(text) as { message?: string };
      if (e.message) msg += `：${e.message}`;
    } catch {
      /* ignore parse error */
    }
    throw new HTTPException(502, { message: msg });
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function buildJsapiParams(ctx: AdapterContext, appId: string, prepayId: string): Record<string, string> {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = genNonce();
  const pkg = `prepay_id=${prepayId}`;
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  const privateKey = ensurePem(requireField(ctx.secrets.wechatPrivateKey, '商户私钥'), 'PRIVATE KEY');
  const paySign = rsaSign(message, privateKey, 'RSA-SHA256');
  return { appId, timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
}

function mapTradeState(state: string | undefined): PaymentQueryResult['status'] {
  switch (state) {
    case 'SUCCESS':
      return 'success';
    case 'CLOSED':
    case 'REVOKED':
      return 'closed';
    case 'PAYERROR':
      return 'failed';
    default:
      return 'pending'; // NOTPAY / USERPAYING
  }
}

function mapRefundStatus(status: string | undefined): RefundResult['status'] {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'PROCESSING':
      return 'processing';
    default:
      return 'failed'; // CLOSED / ABNORMAL
  }
}

function mapNotifyTradeStatus(state: string | undefined): NotifyResult['tradeStatus'] {
  if (state === 'SUCCESS') return 'success';
  if (state === 'CLOSED') return 'closed';
  return 'failed';
}

interface WechatTransaction {
  trade_state?: string;
  transaction_id?: string;
  amount?: { total?: number; payer_total?: number };
  success_time?: string;
}
interface WechatRefund {
  refund_id?: string;
  status?: string;
  success_time?: string;
}

export const wechatPayAdapter: PaymentChannelAdapter = {
  channel: 'wechat',

  async createPayment(ctx, order): Promise<CreatePaymentResult> {
    const appId = requireField(ctx.config.wechatAppId, 'AppId');
    const mchid = requireField(ctx.config.wechatMchId, '商户号');
    const base: Record<string, unknown> = {
      appid: appId,
      mchid,
      description: order.subject,
      out_trade_no: order.outTradeNo,
      notify_url: ctx.notifyUrl,
      amount: { total: order.amount, currency: order.currency || 'CNY' },
    };
    const expiredAt = order.expiredAt ? formatDateTime(order.expiredAt) : undefined;
    switch (order.payMethod) {
      case 'wechat_native': {
        const res = await wechatRequest<{ code_url: string }>(ctx, 'POST', '/v3/pay/transactions/native', base);
        return { orderNo: order.orderNo, channel: 'wechat', payMethod: order.payMethod, codeUrl: res.code_url, expiredAt };
      }
      case 'wechat_h5': {
        const body = { ...base, scene_info: { payer_client_ip: order.clientIp || '127.0.0.1', h5_info: { type: 'Wap' } } };
        const res = await wechatRequest<{ h5_url: string }>(ctx, 'POST', '/v3/pay/transactions/h5', body);
        return { orderNo: order.orderNo, channel: 'wechat', payMethod: order.payMethod, payUrl: res.h5_url, expiredAt };
      }
      case 'wechat_jsapi': {
        const openId = requireField(order.openId, 'JSAPI openId');
        const body = { ...base, payer: { openid: openId } };
        const res = await wechatRequest<{ prepay_id: string }>(ctx, 'POST', '/v3/pay/transactions/jsapi', body);
        return {
          orderNo: order.orderNo,
          channel: 'wechat',
          payMethod: order.payMethod,
          jsapiParams: buildJsapiParams(ctx, appId, res.prepay_id),
          expiredAt,
        };
      }
      default:
        throw new HTTPException(400, { message: `微信支付不支持的支付方式：${order.payMethod}` });
    }
  },

  async queryPayment(ctx, order): Promise<PaymentQueryResult> {
    const mchid = requireField(ctx.config.wechatMchId, '商户号');
    const res = await wechatRequest<WechatTransaction>(
      ctx,
      'GET',
      `/v3/pay/transactions/out-trade-no/${order.outTradeNo}?mchid=${mchid}`,
    );
    return {
      status: mapTradeState(res.trade_state),
      channelTradeNo: res.transaction_id,
      paidAmount: res.amount?.payer_total ?? res.amount?.total,
      paidAt: res.success_time ? new Date(res.success_time) : undefined,
      raw: res,
    };
  },

  async closePayment(ctx, order): Promise<void> {
    const mchid = requireField(ctx.config.wechatMchId, '商户号');
    await wechatRequest(ctx, 'POST', `/v3/pay/transactions/out-trade-no/${order.outTradeNo}/close`, { mchid });
  },

  async refund(ctx, order, refund): Promise<RefundResult> {
    const body: Record<string, unknown> = {
      out_trade_no: order.outTradeNo,
      out_refund_no: refund.outRefundNo,
      reason: refund.reason || undefined,
      notify_url: ctx.notifyUrl,
      amount: { refund: refund.refundAmount, total: refund.totalAmount, currency: 'CNY' },
    };
    const res = await wechatRequest<WechatRefund>(ctx, 'POST', '/v3/refund/domestic/refunds', body);
    return { channelRefundNo: res.refund_id, status: mapRefundStatus(res.status), raw: res };
  },

  async queryRefund(ctx, refund): Promise<RefundQueryResult> {
    const res = await wechatRequest<WechatRefund>(ctx, 'GET', `/v3/refund/domestic/refunds/${refund.outRefundNo}`);
    return {
      channelRefundNo: res.refund_id,
      status: mapRefundStatus(res.status),
      refundedAt: res.success_time ? new Date(res.success_time) : undefined,
      raw: res,
    };
  },

  async verifyNotify(ctx, rawBody, headers): Promise<NotifyResult> {
    const timestamp = headers.get('Wechatpay-Timestamp') ?? '';
    const nonce = headers.get('Wechatpay-Nonce') ?? '';
    const signature = headers.get('Wechatpay-Signature') ?? '';
    const serial = headers.get('Wechatpay-Serial') ?? '';
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    // 优先按回调头 Wechatpay-Serial 选用自动下载的平台证书（应对证书轮换）；回退到手工配置的证书
    let platformCert = '';
    if (serial) {
      const downloaded = await getPlatformCert(ctx, serial);
      if (downloaded) platformCert = downloaded;
    }
    if (!platformCert && ctx.config.wechatPlatformCert) {
      platformCert = ensurePem(ctx.config.wechatPlatformCert, 'CERTIFICATE');
    }
    const valid = platformCert ? rsaVerify(message, signature, platformCert, 'RSA-SHA256') : false;
    const ack = valid
      ? { body: JSON.stringify({ code: 'SUCCESS', message: '成功' }), contentType: 'application/json', status: 200 }
      : { body: JSON.stringify({ code: 'FAIL', message: '验签失败' }), contentType: 'application/json', status: 401 };
    if (!valid) return { valid: false, scene: 'payment', tradeStatus: 'unknown', ack, message: '微信回调验签失败' };

    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false, scene: 'payment', tradeStatus: 'unknown', ack, message: '回调体解析失败' };
    }
    const resource = (envelope.resource ?? {}) as { nonce?: string; associated_data?: string; ciphertext?: string };
    const apiV3Key = requireField(ctx.secrets.wechatApiV3Key, 'APIv3 Key');
    let data: Record<string, any>;
    try {
      const plaintext = aesGcmDecrypt(apiV3Key, resource.nonce ?? '', resource.associated_data ?? '', resource.ciphertext ?? '');
      data = JSON.parse(plaintext) as Record<string, any>;
    } catch (err) {
      logger.warn('[wechat-pay] decrypt notify failed', { err });
      return { valid: false, scene: 'payment', tradeStatus: 'unknown', ack, message: '回调解密失败' };
    }

    const eventType = typeof envelope.event_type === 'string' ? envelope.event_type : '';
    if (eventType.includes('REFUND')) {
      return {
        valid: true,
        scene: 'refund',
        ack,
        outTradeNo: data.out_trade_no,
        outRefundNo: data.out_refund_no,
        channelRefundNo: data.refund_id,
        tradeStatus: data.refund_status === 'SUCCESS' ? 'refunded' : 'failed',
        raw: data,
      };
    }
    return {
      valid: true,
      scene: 'payment',
      ack,
      outTradeNo: data.out_trade_no,
      channelTradeNo: data.transaction_id,
      tradeStatus: mapNotifyTradeStatus(data.trade_state),
      paidAmount: data.amount?.payer_total ?? data.amount?.total,
      paidAt: data.success_time ? new Date(data.success_time) : undefined,
      raw: data,
    };
  },
};
