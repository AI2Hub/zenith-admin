/**
 * 支付可靠性链路（手续费结算 / 资金台账 / 事件 Outbox）— 数据库集成测试（默认跳过）。
 *
 * 覆盖人工最难验证的并发正确性与幂等：
 * - settleOrderFee()：并发/重复投递仅计费一次（条件 UPDATE claim），台账恰好一条
 * - recordLedgerEntry()：同 orderNo+type 并发记账仅一条（部分唯一索引 + ON CONFLICT）
 * - payment outbox：processEvent() 并发 claim 仅一次投递；handler 持续失败时
 *   attempts 递增至上限置 failed 终态；dispatchPendingPaymentEvents() 兜底补投
 *
 * 需要可用的 PostgreSQL（默认连接见 .env）。为避免普通 `npm test` 触库，
 * 仅在显式 opt-in 时运行：
 *   PowerShell:  $env:PAYMENT_DB_IT='1'; npx vitest run src/services/payment/payment-reliability.it.test.ts
 *   Bash:        PAYMENT_DB_IT=1 npx vitest run src/services/payment/payment-reliability.it.test.ts
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { PaymentEvent } from '../../lib/payment-event-bus';

const RUN = process.env.PAYMENT_DB_IT === '1';

const CONCURRENT = { timeout: 20_000 };

describe.runIf(RUN)('payment reliability (DB integration)', () => {
  let db: typeof import('../../db')['db'];
  let schema: typeof import('../../db/schema');
  let feeSvc: typeof import('./payment-fee.service');
  let ledgerSvc: typeof import('./payment-ledger.service');
  let outboxSvc: typeof import('./payment-outbox.service');
  let bus: typeof import('../../lib/payment-event-bus')['paymentEventBus'];

  const tag = `IT${Date.now()}`;
  let seq = 0;
  const feeRuleIds: number[] = [];

  // 测试订阅者：succeeded 计数投递次数；closed 恒抛错驱动重试链
  const delivered: string[] = [];
  const onSucceeded = (e: PaymentEvent) => {
    delivered.push(e.eventId);
  };
  const onClosed = () => {
    throw new Error('it-subscriber-always-fails');
  };

  function newOrderNo(): string {
    seq += 1;
    return `${tag}-${seq}`;
  }

  async function newOrder(patch: Partial<typeof schema.paymentOrders.$inferInsert> = {}) {
    const orderNo = newOrderNo();
    const [row] = await db
      .insert(schema.paymentOrders)
      .values({
        orderNo,
        outTradeNo: `OUT-${orderNo}`,
        bizType: 'it_reliability',
        bizId: orderNo,
        subject: `IT 订单 ${orderNo}`,
        amount: 10000,
        channel: 'wechat',
        payMethod: 'wechat_native',
        status: 'success',
        paidAmount: 10000,
        ...patch,
      })
      .returning();
    return row;
  }

  const feeLedgerRows = (orderNo: string) =>
    db.select().from(schema.paymentLedgerEntries)
      .where(and(eq(schema.paymentLedgerEntries.orderNo, orderNo), eq(schema.paymentLedgerEntries.type, 'fee')));

  beforeAll(async () => {
    db = (await import('../../db')).db;
    schema = await import('../../db/schema');
    feeSvc = await import('./payment-fee.service');
    ledgerSvc = await import('./payment-ledger.service');
    outboxSvc = await import('./payment-outbox.service');
    bus = (await import('../../lib/payment-event-bus')).paymentEventBus;

    bus.on('payment.succeeded', onSucceeded);
    bus.on('payment.closed', onClosed);

    // 超高优先级测试费率规则（60bps），保证 matchFeeRule 必命中它，隔离库内既有规则
    const [rule] = await db
      .insert(schema.paymentFeeRules)
      .values({ name: `it-rule-${tag}`, channel: 'wechat', payMethod: 'wechat_native', rateBps: 60, fixedFee: 0, status: 'enabled', priority: 999_999 })
      .returning({ id: schema.paymentFeeRules.id });
    feeRuleIds.push(rule.id);
  });

  afterAll(async () => {
    bus.off('payment.succeeded', onSucceeded);
    bus.off('payment.closed', onClosed);
    await db.delete(schema.paymentLedgerEntries).where(like(schema.paymentLedgerEntries.orderNo, `${tag}-%`));
    await db.delete(schema.paymentEvents).where(like(schema.paymentEvents.orderNo, `${tag}-%`));
    await db.delete(schema.paymentOrders).where(like(schema.paymentOrders.orderNo, `${tag}-%`));
    if (feeRuleIds.length) await db.delete(schema.paymentFeeRules).where(inArray(schema.paymentFeeRules.id, feeRuleIds));
    await (await import('../../db')).closeDb();
  });

  // ─── settleOrderFee：手续费结算幂等 ──────────────────────────────────────────
  describe('settleOrderFee — 并发/重复投递仅计费一次', () => {
    it('并发 5 次结算：feeAmount/netAmount 只写一次，fee 台账恰好一条', CONCURRENT, async () => {
      const order = await newOrder();
      await Promise.all(Array.from({ length: 5 }, () => feeSvc.settleOrderFee(order.orderNo)));

      const [fresh] = await db.select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, order.id));
      expect(fresh.feeAmount).toBe(60); // 10000 × 60bps
      expect(fresh.netAmount).toBe(9940);

      const ledger = await feeLedgerRows(order.orderNo);
      expect(ledger).toHaveLength(1);
      expect(ledger[0].amount).toBe(60);
      expect(ledger[0].direction).toBe('out');
    });

    it('串行重复投递（事件重发场景）不重复计费不重复记账', async () => {
      const order = await newOrder();
      await feeSvc.settleOrderFee(order.orderNo);
      await feeSvc.settleOrderFee(order.orderNo);
      await feeSvc.settleOrderFee(order.orderNo);

      const [fresh] = await db.select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, order.id));
      expect(fresh.feeAmount).toBe(60);
      expect(await feeLedgerRows(order.orderNo)).toHaveLength(1);
    });

    it('订单已带 feeAmount 但缺 netAmount（崩溃恢复）→ 仅补 netAmount，不重新计费', async () => {
      const order = await newOrder({ feeAmount: 88, netAmount: null });
      await feeSvc.settleOrderFee(order.orderNo);

      const [fresh] = await db.select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, order.id));
      expect(fresh.feeAmount).toBe(88); // 不被测试规则的 60 覆盖
      expect(fresh.netAmount).toBe(10000 - 88);
    });
  });

  // ─── recordLedgerEntry：台账幂等 ─────────────────────────────────────────────
  describe('recordLedgerEntry — 部分唯一索引防重复记账', () => {
    it('同 orderNo+type 并发 6 次记账仅落一条', CONCURRENT, async () => {
      const orderNo = newOrderNo();
      await Promise.all(
        Array.from({ length: 6 }, () =>
          ledgerSvc.recordLedgerEntry({ direction: 'in', type: 'payment', amount: 5000, orderNo, channel: 'wechat' }),
        ),
      );
      const rows = await db.select().from(schema.paymentLedgerEntries)
        .where(and(eq(schema.paymentLedgerEntries.orderNo, orderNo), eq(schema.paymentLedgerEntries.type, 'payment')));
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(5000);
    });

    it('同一订单不同 type（payment + fee）可各记一条', async () => {
      const orderNo = newOrderNo();
      await ledgerSvc.recordLedgerEntry({ direction: 'in', type: 'payment', amount: 5000, orderNo });
      await ledgerSvc.recordLedgerEntry({ direction: 'out', type: 'fee', amount: 30, orderNo });
      const rows = await db.select().from(schema.paymentLedgerEntries).where(eq(schema.paymentLedgerEntries.orderNo, orderNo));
      expect(rows).toHaveLength(2);
    });

    it('金额 ≤ 0 不记账', async () => {
      const orderNo = newOrderNo();
      await ledgerSvc.recordLedgerEntry({ direction: 'in', type: 'payment', amount: 0, orderNo });
      const rows = await db.select().from(schema.paymentLedgerEntries).where(eq(schema.paymentLedgerEntries.orderNo, orderNo));
      expect(rows).toHaveLength(0);
    });
  });

  // ─── payment outbox：可靠投递 ────────────────────────────────────────────────
  describe('payment outbox — claim 并发与重试链', () => {
    function eventPayload(orderNo: string, type: 'payment.succeeded' | 'payment.closed') {
      return {
        type,
        orderNo,
        payload: {
          type,
          orderNo,
          outTradeNo: `OUT-${orderNo}`,
          bizType: 'it_reliability',
          bizId: orderNo,
          channel: 'wechat' as const,
          amount: 10000,
        },
      };
    }

    it('并发 processEvent 同一事件仅投递一次（claim 抢占）', CONCURRENT, async () => {
      const orderNo = newOrderNo();
      const id = await db.transaction((tx) => outboxSvc.recordEvent(tx, eventPayload(orderNo, 'payment.succeeded')));

      const before = delivered.length;
      await Promise.all(Array.from({ length: 5 }, () => outboxSvc.processEvent(id)));

      expect(delivered.length - before).toBe(1);
      const [row] = await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.id, id));
      expect(row.status).toBe('done');
      expect(row.processedAt).not.toBeNull();
    });

    it('已 done 的事件重复 process 不再投递（终态幂等）', async () => {
      const orderNo = newOrderNo();
      const id = await db.transaction((tx) => outboxSvc.recordEvent(tx, eventPayload(orderNo, 'payment.succeeded')));
      await outboxSvc.processEvent(id);

      const before = delivered.length;
      await outboxSvc.processEvent(id);
      expect(delivered.length - before).toBe(0);
    });

    it('订阅者持续失败：attempts 逐次递增至 5 → failed 终态，此后不再投递', CONCURRENT, async () => {
      const orderNo = newOrderNo();
      const id = await db.transaction((tx) => outboxSvc.recordEvent(tx, eventPayload(orderNo, 'payment.closed')));

      for (let i = 1; i <= 5; i++) {
        await outboxSvc.processEvent(id);
        const [row] = await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.id, id));
        expect(row.attempts).toBe(i);
        expect(row.status).toBe(i < 5 ? 'pending' : 'failed');
        expect(row.lastError).toContain('it-subscriber-always-fails');
        if (i < 5) expect(row.processedAt).toBeNull(); // 释放 claim 以便补投
      }

      // 达上限后不可再被 claim
      await outboxSvc.processEvent(id);
      const [final] = await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.id, id));
      expect(final.attempts).toBe(5);
      expect(final.status).toBe('failed');
    });

    it('dispatchPendingPaymentEvents 兜底补投遗留 pending 事件', CONCURRENT, async () => {
      const orderNo = newOrderNo();
      const id = await db.transaction((tx) => outboxSvc.recordEvent(tx, eventPayload(orderNo, 'payment.succeeded')));

      const before = delivered.length;
      const scanned = await outboxSvc.dispatchPendingPaymentEvents();

      expect(scanned).toBeGreaterThanOrEqual(1);
      expect(delivered.length - before).toBeGreaterThanOrEqual(1);
      const [row] = await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.id, id));
      expect(row.status).toBe('done');
    });
  });
});
