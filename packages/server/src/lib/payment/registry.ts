/**
 * 支付渠道适配器注册表。
 *
 * 新增渠道：实现 PaymentChannelAdapter 后在 lib/payment/index.ts 的
 * initPaymentAdapters() 中调用 registerAdapter() 即可，门面与业务层零改动。
 */
import { HTTPException } from 'hono/http-exception';
import type { PaymentChannel } from '@zenith/shared';
import type { PaymentChannelAdapter } from './types';

const adapterRegistry = new Map<PaymentChannel, PaymentChannelAdapter>();

export function registerAdapter(adapter: PaymentChannelAdapter): void {
  adapterRegistry.set(adapter.channel, adapter);
}

export function getAdapter(channel: PaymentChannel): PaymentChannelAdapter {
  const adapter = adapterRegistry.get(channel);
  if (!adapter) throw new HTTPException(400, { message: `不支持的支付渠道：${channel}` });
  return adapter;
}

export function hasAdapter(channel: PaymentChannel): boolean {
  return adapterRegistry.has(channel);
}
