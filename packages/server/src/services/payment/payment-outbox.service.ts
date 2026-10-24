/**
 * 支付事件 Outbox 服务。
 *
 * 解决「进程内事件总线在崩溃时丢失履约事件」的可靠性问题：
 * 支付/退款成功时，在更新订单/退款状态的**同一事务**内写入 outbox 事件（原子持久化），
 * 提交后立即 setImmediate 异步投递（低延迟）；若进程崩溃，cron `dispatchPaymentEvents`
 * 兜底补投 pending 事件。业务订阅者须自身幂等（可能被 outbox 与实时路径各投一次）。
 */
import { and, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { paymentEventAttempts, paymentEvents, type PaymentEventRow } from '../../db/schema';
import type { DbTransaction } from '../../db/types';
import { paymentEventBus, type PaymentEvent, type PaymentEventType } from '../../lib/payment-event-bus';
import logger from '../../lib/logger';
import { formatDateTime } from '../../lib/datetime';
import { currentTraceId, currentParentRef } from '../../lib/context';
import { recordDomainEvent } from '../platform/relations/events.service';

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const INTERRUPTED_ATTEMPT_ERROR = '投递进程中断或超时，已由后续尝试接管';
const EXHAUSTED_ATTEMPT_ERROR = '投递进程中断或超时，且已达到最大尝试次数';

export interface OutboxEventInput {
  type: PaymentEventType;
  orderNo: string;
  payload: Omit<PaymentEvent, 'eventId' | 'occurredAt'>;
  tenantId: number | null;
}

/** 在事务内插入 outbox 事件（与订单/退款状态更新同事务，保证原子持久化）。返回事件 id。 */
export async function recordEvent(tx: DbTransaction, input: OutboxEventInput): Promise<number> {
  if (!input.payload.subjectRefs?.length) throw new Error('Payment event requires explicit business subjects');
  if (input.tenantId === undefined || input.payload.tenantId !== input.tenantId) throw new Error('Payment event tenant must match its order');
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
  await recordDomainEvent(tx, {
    eventType: input.type,
    payload: input.payload,
    subjects: input.payload.subjectRefs,
    tenantId: input.tenantId,
    source: input.payload.subjectRefs.find((subject) => subject.role === 'primary') ?? input.payload.subjectRefs[0],
    traceId: currentTraceId(),
    parentRef: currentParentRef(),
    dedupeKey: `payment-outbox:${row.id}`,
  });
  return row.id;
}

async function dispatchRow(row: PaymentEventRow): Promise<void> {
  const payload = JSON.parse(row.payload) as Omit<PaymentEvent, 'eventId' | 'occurredAt'>;
  await paymentEventBus.dispatch({ ...payload, eventId: `payment-outbox-${row.id}`, occurredAt: formatDateTime(row.createdAt) });
}

export async function interruptProcessingPaymentEventAttempts(
  tx: DbTransaction,
  eventId: number,
  finishedAt: Date,
  errorMessage: string,
  generation?: number,
): Promise<void> {
  await tx.update(paymentEventAttempts).set({
    status: 'failed',
    errorMessage,
    finishedAt,
  }).where(generation === undefined
    ? and(eq(paymentEventAttempts.eventId, eventId), eq(paymentEventAttempts.status, 'processing'))
    : and(eq(paymentEventAttempts.eventId, eventId), eq(paymentEventAttempts.generation, generation), eq(paymentEventAttempts.status, 'processing')));
}

async function claimEventAttempt(id: number): Promise<{ row: PaymentEventRow; attemptId: number } | null> {
  const startedAt = new Date();
  const claimBefore = new Date(startedAt.getTime() - CLAIM_TIMEOUT_MS);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(paymentEvents)
      .set({ attempts: sql`${paymentEvents.attempts} + 1`, processedAt: startedAt })
      .where(and(
        eq(paymentEvents.id, id),
        eq(paymentEvents.status, 'pending'),
        lt(paymentEvents.attempts, MAX_ATTEMPTS),
        or(isNull(paymentEvents.processedAt), lt(paymentEvents.processedAt, claimBefore)),
      ))
      .returning();
    if (!row) {
      const [exhausted] = await tx.update(paymentEvents).set({
        status: 'failed',
        lastError: EXHAUSTED_ATTEMPT_ERROR,
        processedAt: startedAt,
      }).where(and(
        eq(paymentEvents.id, id),
        eq(paymentEvents.status, 'pending'),
        gte(paymentEvents.attempts, MAX_ATTEMPTS),
        or(isNull(paymentEvents.processedAt), lt(paymentEvents.processedAt, claimBefore)),
      )).returning({ id: paymentEvents.id, generation: paymentEvents.generation });
      if (exhausted) {
        await interruptProcessingPaymentEventAttempts(tx, exhausted.id, startedAt, EXHAUSTED_ATTEMPT_ERROR, exhausted.generation);
      }
      return null;
    }

    await interruptProcessingPaymentEventAttempts(tx, row.id, startedAt, INTERRUPTED_ATTEMPT_ERROR, row.generation);
    const [attempt] = await tx.insert(paymentEventAttempts).values({
      eventId: row.id,
      generation: row.generation,
      attemptNo: row.attempts,
      status: 'processing',
      startedAt,
    }).returning({ id: paymentEventAttempts.id });
    if (!attempt) throw new Error('创建支付事件投递尝试失败');
    return { row, attemptId: attempt.id };
  });
}

async function finishEventAttempt(
  claim: { row: PaymentEventRow; attemptId: number },
  outcome: 'succeeded' | 'failed',
  errorMessage: string | null,
): Promise<void> {
  const finishedAt = new Date();
  await db.transaction(async (tx) => {
    const [attempt] = await tx.update(paymentEventAttempts).set({
      status: outcome,
      errorMessage,
      finishedAt,
    }).where(and(
      eq(paymentEventAttempts.id, claim.attemptId),
      eq(paymentEventAttempts.status, 'processing'),
    )).returning({ id: paymentEventAttempts.id });
    if (!attempt) return;

    if (outcome === 'succeeded') {
      await tx.update(paymentEvents).set({
        status: 'done',
        lastError: null,
        processedAt: finishedAt,
      }).where(and(
        eq(paymentEvents.id, claim.row.id),
        eq(paymentEvents.status, 'pending'),
        eq(paymentEvents.generation, claim.row.generation),
        eq(paymentEvents.attempts, claim.row.attempts),
      ));
      return;
    }

    const status = claim.row.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await tx.update(paymentEvents).set({
      status,
      lastError: errorMessage,
      processedAt: status === 'pending' ? null : finishedAt,
    }).where(and(
      eq(paymentEvents.id, claim.row.id),
      eq(paymentEvents.status, 'pending'),
      eq(paymentEvents.generation, claim.row.generation),
      eq(paymentEvents.attempts, claim.row.attempts),
    ));
  });
}

/** 处理单个 outbox 事件：claim 时计数并写尝试历史，成功清错，失败保留当前错误（达上限置 failed）。 */
export async function processEvent(id: number): Promise<void> {
  const claim = await claimEventAttempt(id);
  if (!claim) return;
  try {
    await dispatchRow(claim.row);
    await finishEventAttempt(claim, 'succeeded', null);
  } catch (err) {
    const lastError = (err instanceof Error ? err.message : 'unknown').slice(0, 500);
    await finishEventAttempt(claim, 'failed', lastError);
    logger.warn('[payment-outbox] dispatch failed', { id, attempts: claim.row.attempts, err: lastError });
  }
}

/** Cron 兜底：补投所有 pending 且未超重试上限的事件（含进程崩溃遗留）。返回扫描条数。 */
export async function dispatchPendingPaymentEvents(): Promise<number> {
  const claimBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const rows = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(and(eq(paymentEvents.status, 'pending'), or(isNull(paymentEvents.processedAt), lt(paymentEvents.processedAt, claimBefore))))
    .limit(200);
  for (const row of rows) {
    await processEvent(row.id);
  }
  return rows.length;
}
