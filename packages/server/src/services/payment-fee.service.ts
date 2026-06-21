/**
 * 支付手续费/费率 Service。
 * 维护费率规则（按渠道/支付方式匹配，万分比 + 固定费，clamp 上下限），
 * 监听 payment.succeeded 计算手续费：回写订单 feeAmount/netAmount 并记资金台账（type=fee）。
 */
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { paymentFeeRules, paymentOrders, type PaymentFeeRuleRow } from '../db/schema';
import { currentUser } from '../lib/context';
import { getCreateTenantId, tenantCondition } from '../lib/tenant';
import { mergeWhere, withPagination } from '../lib/where-helpers';
import { formatDateTime } from '../lib/datetime';
import { recordLedgerEntry } from './payment-ledger.service';
import { paymentEventBus } from '../lib/payment-event-bus';
import logger from '../lib/logger';
import type { CreatePaymentFeeRuleInput, UpdatePaymentFeeRuleInput } from '@zenith/shared';
import type { PaymentChannel, PaymentFeeRule, PaymentMethod } from '@zenith/shared';

export function mapFeeRule(row: PaymentFeeRuleRow): PaymentFeeRule {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    payMethod: row.payMethod ?? null,
    rateBps: row.rateBps,
    fixedFee: row.fixedFee,
    minFee: row.minFee ?? null,
    maxFee: row.maxFee ?? null,
    status: row.status,
    priority: row.priority,
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export interface ListFeeRulesQuery {
  page?: number;
  pageSize?: number;
  channel?: PaymentChannel;
  status?: 'enabled' | 'disabled';
}

export async function listFeeRules(q: ListFeeRulesQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.channel) conds.push(eq(paymentFeeRules.channel, q.channel));
  if (q.status) conds.push(eq(paymentFeeRules.status, q.status));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentFeeRules, currentUser()));
  const [total, list] = await Promise.all([
    db.$count(paymentFeeRules, where),
    withPagination(
      db.select().from(paymentFeeRules).where(where).orderBy(desc(paymentFeeRules.priority), desc(paymentFeeRules.id)).$dynamic(),
      page,
      pageSize,
    ),
  ]);
  return { list: list.map(mapFeeRule), total, page, pageSize };
}

async function ensureFeeRule(id: number): Promise<PaymentFeeRuleRow> {
  const tc = tenantCondition(paymentFeeRules, currentUser());
  const [row] = await db.select().from(paymentFeeRules).where(and(eq(paymentFeeRules.id, id), tc)).limit(1);
  if (!row) throw new HTTPException(404, { message: '费率规则不存在' });
  return row;
}

export async function getFeeRule(id: number): Promise<PaymentFeeRule> {
  return mapFeeRule(await ensureFeeRule(id));
}

function assertFeeBounds(min?: number | null, max?: number | null): void {
  if (min != null && max != null && min > max) {
    throw new HTTPException(400, { message: '最低手续费不能大于最高手续费' });
  }
}

export async function createFeeRule(input: CreatePaymentFeeRuleInput): Promise<PaymentFeeRule> {
  assertFeeBounds(input.minFee, input.maxFee);
  const [row] = await db
    .insert(paymentFeeRules)
    .values({
      name: input.name,
      channel: input.channel,
      payMethod: input.payMethod ?? null,
      rateBps: input.rateBps ?? 0,
      fixedFee: input.fixedFee ?? 0,
      minFee: input.minFee ?? null,
      maxFee: input.maxFee ?? null,
      status: input.status ?? 'enabled',
      priority: input.priority ?? 0,
      remark: input.remark ?? null,
      tenantId: getCreateTenantId(currentUser()),
    })
    .returning();
  return mapFeeRule(row);
}

export async function updateFeeRule(id: number, input: UpdatePaymentFeeRuleInput): Promise<PaymentFeeRule> {
  const existing = await ensureFeeRule(id);
  const min = input.minFee !== undefined ? input.minFee : existing.minFee;
  const max = input.maxFee !== undefined ? input.maxFee : existing.maxFee;
  assertFeeBounds(min, max);
  const set: Partial<PaymentFeeRuleRow> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.channel !== undefined) set.channel = input.channel;
  if (input.payMethod !== undefined) set.payMethod = input.payMethod ?? null;
  if (input.rateBps !== undefined) set.rateBps = input.rateBps;
  if (input.fixedFee !== undefined) set.fixedFee = input.fixedFee;
  if (input.minFee !== undefined) set.minFee = input.minFee ?? null;
  if (input.maxFee !== undefined) set.maxFee = input.maxFee ?? null;
  if (input.status !== undefined) set.status = input.status;
  if (input.priority !== undefined) set.priority = input.priority;
  if (input.remark !== undefined) set.remark = input.remark ?? null;
  const tc = tenantCondition(paymentFeeRules, currentUser());
  const [row] = await db.update(paymentFeeRules).set(set).where(and(eq(paymentFeeRules.id, id), tc)).returning();
  return mapFeeRule(row);
}

export async function deleteFeeRule(id: number): Promise<void> {
  await ensureFeeRule(id);
  await db.delete(paymentFeeRules).where(eq(paymentFeeRules.id, id));
}

/** 计算手续费（分）：rate*amount/10000 + fixed，clamp[min,max]。无匹配规则返回 0。 */
export function computeFeeByRule(rule: PaymentFeeRuleRow, amount: number): number {
  let fee = Math.round((amount * rule.rateBps) / 10000) + rule.fixedFee;
  if (rule.minFee != null) fee = Math.max(fee, rule.minFee);
  if (rule.maxFee != null) fee = Math.min(fee, rule.maxFee);
  return Math.max(0, Math.min(fee, amount));
}

/** 匹配最优费率规则（按 tenant + channel + payMethod，优先 payMethod 精确，再按 priority 降序）。 */
export async function matchFeeRule(channel: PaymentChannel, payMethod: PaymentMethod, tenantId: number | null): Promise<PaymentFeeRuleRow | null> {
  const tenantCond = tenantId == null ? isNull(paymentFeeRules.tenantId) : or(eq(paymentFeeRules.tenantId, tenantId), isNull(paymentFeeRules.tenantId));
  const rows = await db
    .select()
    .from(paymentFeeRules)
    .where(and(eq(paymentFeeRules.status, 'enabled'), eq(paymentFeeRules.channel, channel), or(isNull(paymentFeeRules.payMethod), eq(paymentFeeRules.payMethod, payMethod)), tenantCond))
    .orderBy(desc(paymentFeeRules.priority), desc(paymentFeeRules.id));
  if (rows.length === 0) return null;
  const exact = rows.find((r) => r.payMethod === payMethod);
  return exact ?? rows[0];
}

/** 支付成功后结算手续费：回写订单 feeAmount/netAmount + 记台账（幂等：已算过则跳过）。 */
export async function settleOrderFee(orderNo: string): Promise<void> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.orderNo, orderNo)).limit(1);
  if (!order || order.feeAmount != null) return;
  const amount = order.paidAmount ?? order.amount;
  const rule = await matchFeeRule(order.channel, order.payMethod, order.tenantId);
  const fee = rule ? computeFeeByRule(rule, amount) : 0;
  await db.update(paymentOrders).set({ feeAmount: fee, netAmount: amount - fee }).where(eq(paymentOrders.id, order.id));
  if (fee > 0) {
    await recordLedgerEntry({
      direction: 'out',
      type: 'fee',
      amount: fee,
      orderNo: order.orderNo,
      channel: order.channel,
      bizType: order.bizType,
      tenantId: order.tenantId,
      remark: rule ? `手续费（${rule.name}）` : '手续费',
    });
  }
}

let registered = false;
/** 注册手续费订阅者（支付成功时结算手续费）。 */
export function registerFeeSubscribers(): void {
  if (registered) return;
  registered = true;
  paymentEventBus.on('payment.succeeded', (e) => {
    void settleOrderFee(e.orderNo).catch((err) => logger.error('[payment-fee] settle fee failed', { orderNo: e.orderNo, err }));
  });
  logger.info('Payment fee subscribers registered');
}
