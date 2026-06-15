/**
 * 支付异步回调（公开端点，无需登录，由微信/支付宝服务器调用）。
 *
 * POST /api/public/payment/notify/{channel}
 *
 * 处理流程见 payment.service.handleNotify：读取原始 body → 逐个启用配置验签 →
 * 幂等更新订单/退款 → 落回调日志 → 发支付事件，并返回渠道要求的 ACK。
 * 使用原生 Hono 路由以便返回纯文本/JSON 的渠道 ACK 响应。
 */
import { Hono } from 'hono';
import { handleNotify } from '../services/payment.service';
import { getClientIp } from '../lib/request-helpers';

const router = new Hono();

router.post('/:channel', async (c) => {
  const channel = c.req.param('channel');
  if (channel !== 'wechat' && channel !== 'alipay') {
    return c.text('unsupported channel', 400);
  }
  const rawBody = await c.req.raw.clone().text();
  const ip = getClientIp(c);
  const { ack } = await handleNotify(channel, rawBody, c.req.raw.headers, ip);
  return new Response(ack.body, { status: ack.status, headers: { 'Content-Type': ack.contentType } });
});

export default router;
