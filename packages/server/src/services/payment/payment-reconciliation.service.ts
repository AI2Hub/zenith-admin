/**
 * 支付对账 / 关单定时任务（供 pg-boss-scheduler 注册的 handler 调用）。
 */
import { and, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../../db';
import { paymentOrders } from '../../db/schema';
import { getAdapter } from '../../lib/payment';
import { buildAdapterContext, loadOrderConfig, syncOrderStatus } from './payment.service';
import logger from '../../lib/logger';

/** 关闭所有已超过 expiredAt 仍未支付的订单（pending / paying）。返回关闭数量。 */
export async function closeExpiredOrders(): Promise<number> {
  const now = new Date();
  const rows = await db
    .select()
    .from(paymentOrders)
    .where(and(inArray(paymentOrders.status, ['pending', 'paying']), lt(paymentOrders.expiredAt, now)));
  let count = 0;
  for (const order of rows) {
    try {
      // 先主动查单：若用户已在过期边缘完成支付，会被标记 success，从而跳过关单，避免误关已支付订单
      const synced = await syncOrderStatus(order);
      if (synced.status !== 'pending' && synced.status !== 'paying') continue;
      const config = await loadOrderConfig(order);
      if (config) {
        try {
          await getAdapter(order.channel).closePayment(buildAdapterContext(config), order);
        } catch {
          /* 渠道关单失败不阻塞本地关单 */
        }
      }
      // 条件更新：仅当仍处于待支付态时才置为 closed
      const closed = await db
        .update(paymentOrders)
        .set({ status: 'closed' })
        .where(and(eq(paymentOrders.id, order.id), inArray(paymentOrders.status, ['pending', 'paying'])))
        .returning({ id: paymentOrders.id });
      if (closed.length > 0) count++;
    } catch (err) {
      logger.warn('[payment] close expired failed', { orderNo: order.orderNo, err: err instanceof Error ? err.message : 'unknown' });
    }
  }
  return count;
}

/** 对仍处于 paying 且创建超过 2 分钟的订单主动查单，纠正状态（回调兜底）。 */
export async function runReconciliation(): Promise<{ checked: number; fixed: number }> {
  const threshold = new Date(Date.now() - 2 * 60_000);
  const rows = await db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.status, 'paying'), lt(paymentOrders.createdAt, threshold)));
  let fixed = 0;
  for (const order of rows) {
    const updated = await syncOrderStatus(order);
    if (updated.status !== order.status) fixed++;
  }
  return { checked: rows.length, fixed };
}
