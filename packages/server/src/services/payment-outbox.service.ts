/**
 * 支付事件 Outbox 服务。
 *
 * 解决「进程内事件总线在崩溃时丢失履约事件」的可靠性问题：
 * 支付/退款成功时，在更新订单/退款状态的**同一事务**内写入 outbox 事件（原子持久化），
 * 提交后立即 setImmediate 异步投递（低延迟）；若进程崩溃，cron `dispatchPaymentEvents`
 * 兜底补投 pending 事件。业务订阅者须自身幂等（可能被 outbox 与实时路径各投一次）。
 */
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { paymentEvents, type PaymentEventRow } from '../db/schema';
import type { DbExecutor } from '../db/types';
import { paymentEventBus, type PaymentEvent, type PaymentEventType } from '../lib/payment-event-bus';
import logger from '../lib/logger';

const MAX_ATTEMPTS = 5;

export interface OutboxEventInput {
  type: PaymentEventType;
  orderNo: string;
  payload: Omit<PaymentEvent, 'eventId' | 'occurredAt'>;
  tenantId?: number | null;
}

/** 在事务内插入 outbox 事件（与订单/退款状态更新同事务，保证原子持久化）。返回事件 id。 */
export async function recordEvent(tx: DbExecutor, input: OutboxEventInput): Promise<number> {
  const [row] = await tx
    .insert(paymentEvents)
    .values({
      type: input.type,
      orderNo: input.orderNo,
      payload: JSON.stringify(input.payload),
      status: 'pending',
      tenantId: input.tenantId ?? null,
    })
    .returning({ id: paymentEvents.id });
  return row.id;
}

async function dispatchRow(row: PaymentEventRow): Promise<void> {
  const payload = JSON.parse(row.payload) as Omit<PaymentEvent, 'eventId' | 'occurredAt'>;
  await paymentEventBus.dispatch(payload);
}

/** 处理单个 outbox 事件：成功标记 done；失败累加 attempts 并记录错误（达上限置 failed）。 */
export async function processEvent(id: number): Promise<void> {
  const [row] = await db.select().from(paymentEvents).where(eq(paymentEvents.id, id)).limit(1);
  if (!row || row.status === 'done') return;
  try {
    await dispatchRow(row);
    await db.update(paymentEvents).set({ status: 'done', processedAt: new Date() }).where(eq(paymentEvents.id, id));
  } catch (err) {
    const attempts = row.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    const lastError = (err instanceof Error ? err.message : 'unknown').slice(0, 500);
    await db.update(paymentEvents).set({ attempts, status, lastError }).where(eq(paymentEvents.id, id));
    logger.warn('[payment-outbox] dispatch failed', { id, attempts, err: lastError });
  }
}

/** Cron 兜底：补投所有 pending 且未超重试上限的事件（含进程崩溃遗留）。返回扫描条数。 */
export async function dispatchPendingPaymentEvents(): Promise<number> {
  const rows = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(and(eq(paymentEvents.status, 'pending'), lt(paymentEvents.attempts, MAX_ATTEMPTS)))
    .limit(200);
  for (const row of rows) {
    await processEvent(row.id);
  }
  return rows.length;
}
