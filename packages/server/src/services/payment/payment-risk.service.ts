/**
 * 支付风控 Service。
 * 规则（全局/按渠道/按业务类型）：单笔上限、当日累计金额/笔数、黑名单（openid/用户ID/IP）、
 * 白名单（命中跳过规则）；命中动作 block=拦截下单，review=落单挂起进入人工审核队列。
 * 每次命中均落留痕（payment_risk_hits）；审核放行后用户重新下单复用挂起订单继续支付，
 * 拒绝则本地关闭挂起订单（渠道侧从未下单）。
 */
import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { randomInt } from 'node:crypto';
import { db } from '../../db';
import {
  paymentOrders,
  paymentRiskHits,
  paymentRiskReviews,
  paymentRiskRules,
  type PaymentOrderRow,
  type PaymentRiskHitRow,
  type PaymentRiskReviewRow,
  type PaymentRiskRuleRow,
} from '../../db/schema';
import { currentUser } from '../../lib/context';
import { getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { mergeWhere, escapeLike, withPagination } from '../../lib/where-helpers';
import { pageOffset } from '../../lib/pagination';
import { formatDateTime, formatNullableDateTime, parseDateRangeEnd, parseDateRangeStart } from '../../lib/datetime';
import { recordEvent, processEvent } from './payment-outbox.service';
import type { CreatePaymentRiskRuleInput, UpdatePaymentRiskRuleInput } from '@zenith/shared';
import type {
  PaymentChannel,
  PaymentRiskDimension,
  PaymentRiskHit,
  PaymentRiskReview,
  PaymentRiskReviewStatus,
  PaymentRiskRule,
  PaymentRiskScope,
} from '@zenith/shared';

export function mapRiskRule(row: PaymentRiskRuleRow): PaymentRiskRule {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    channel: row.channel ?? null,
    bizType: row.bizType ?? null,
    singleLimit: row.singleLimit ?? null,
    dailyLimit: row.dailyLimit ?? null,
    dailyCountLimit: row.dailyCountLimit ?? null,
    blocklist: row.blocklist ?? [],
    allowlist: row.allowlist ?? [],
    action: row.action,
    status: row.status,
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export interface ListRiskRulesQuery {
  page?: number;
  pageSize?: number;
  scope?: PaymentRiskScope;
  status?: 'enabled' | 'disabled';
}

export async function listRiskRules(q: ListRiskRulesQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.scope) conds.push(eq(paymentRiskRules.scope, q.scope));
  if (q.status) conds.push(eq(paymentRiskRules.status, q.status));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentRiskRules, currentUser()));
  const [total, list] = await Promise.all([
    db.$count(paymentRiskRules, where),
    withPagination(db.select().from(paymentRiskRules).where(where).orderBy(desc(paymentRiskRules.id)).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapRiskRule), total, page, pageSize };
}

async function ensureRiskRule(id: number): Promise<PaymentRiskRuleRow> {
  const tc = tenantCondition(paymentRiskRules, currentUser());
  const [row] = await db.select().from(paymentRiskRules).where(and(eq(paymentRiskRules.id, id), tc)).limit(1);
  if (!row) throw new HTTPException(404, { message: '风控规则不存在' });
  return row;
}

export async function getRiskRule(id: number): Promise<PaymentRiskRule> {
  return mapRiskRule(await ensureRiskRule(id));
}

function normalizeScopeFields(input: Partial<CreatePaymentRiskRuleInput>): { channel: PaymentChannel | null; bizType: string | null } {
  if (input.scope === 'channel') return { channel: input.channel ?? null, bizType: null };
  if (input.scope === 'bizType') return { channel: null, bizType: input.bizType ?? null };
  return { channel: null, bizType: null };
}

export async function createRiskRule(input: CreatePaymentRiskRuleInput): Promise<PaymentRiskRule> {
  const scoped = normalizeScopeFields(input);
  if (input.scope === 'channel' && !scoped.channel) throw new HTTPException(400, { message: '按渠道规则需指定渠道' });
  if (input.scope === 'bizType' && !scoped.bizType) throw new HTTPException(400, { message: '按业务类型规则需指定业务类型' });
  const [row] = await db
    .insert(paymentRiskRules)
    .values({
      name: input.name,
      scope: input.scope ?? 'global',
      channel: scoped.channel,
      bizType: scoped.bizType,
      singleLimit: input.singleLimit ?? null,
      dailyLimit: input.dailyLimit ?? null,
      dailyCountLimit: input.dailyCountLimit ?? null,
      blocklist: input.blocklist ?? [],
      allowlist: input.allowlist ?? [],
      action: input.action ?? 'block',
      status: input.status ?? 'enabled',
      remark: input.remark ?? null,
      tenantId: getCreateTenantId(currentUser()),
    })
    .returning();
  return mapRiskRule(row);
}

export async function updateRiskRule(id: number, input: UpdatePaymentRiskRuleInput): Promise<PaymentRiskRule> {
  const existing = await ensureRiskRule(id);
  const set: Partial<PaymentRiskRuleRow> = {};
  if (input.name !== undefined) set.name = input.name;
  const nextScope = input.scope ?? existing.scope;
  if (input.scope !== undefined || input.channel !== undefined || input.bizType !== undefined) {
    const scoped = normalizeScopeFields({ scope: nextScope, channel: input.channel ?? existing.channel ?? undefined, bizType: input.bizType ?? existing.bizType ?? undefined });
    if (nextScope === 'channel' && !scoped.channel) throw new HTTPException(400, { message: '按渠道规则需指定渠道' });
    if (nextScope === 'bizType' && !scoped.bizType) throw new HTTPException(400, { message: '按业务类型规则需指定业务类型' });
    set.scope = nextScope;
    set.channel = scoped.channel;
    set.bizType = scoped.bizType;
  }
  if (input.singleLimit !== undefined) set.singleLimit = input.singleLimit ?? null;
  if (input.dailyLimit !== undefined) set.dailyLimit = input.dailyLimit ?? null;
  if (input.dailyCountLimit !== undefined) set.dailyCountLimit = input.dailyCountLimit ?? null;
  if (input.blocklist !== undefined) set.blocklist = input.blocklist;
  if (input.allowlist !== undefined) set.allowlist = input.allowlist;
  if (input.action !== undefined) set.action = input.action;
  if (input.status !== undefined) set.status = input.status;
  if (input.remark !== undefined) set.remark = input.remark ?? null;
  const tc = tenantCondition(paymentRiskRules, currentUser());
  const [row] = await db.update(paymentRiskRules).set(set).where(and(eq(paymentRiskRules.id, id), tc)).returning();
  return mapRiskRule(row);
}

export async function deleteRiskRule(id: number): Promise<void> {
  await ensureRiskRule(id);
  await db.delete(paymentRiskRules).where(eq(paymentRiskRules.id, id));
}

// ─── 下单风控评估 ─────────────────────────────────────────────────────────────
export interface RiskCheckInput {
  channel: PaymentChannel;
  bizType: string;
  bizId: string;
  amount: number;
  openId?: string | null;
  userId?: number | null;
  clientIp?: string | null;
  tenantId?: number | null;
}

export type RiskDecision =
  | { action: 'pass' }
  | { action: 'block' | 'review'; rule: PaymentRiskRuleRow; dimension: PaymentRiskDimension; dimensionValue: string; message: string };

function ruleApplies(rule: PaymentRiskRuleRow, input: RiskCheckInput): boolean {
  if (rule.scope === 'global') return true;
  if (rule.scope === 'channel') return rule.channel === input.channel;
  if (rule.scope === 'bizType') return rule.bizType === input.bizType;
  return false;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 参与名单匹配的标识集合（openid / 用户ID / 客户端IP） */
function identifiersOf(input: RiskCheckInput): string[] {
  return [input.openId, input.userId != null ? String(input.userId) : null, input.clientIp].filter((v): v is string => !!v);
}

/**
 * 下单前风控评估：按启用规则依次检查白名单（跳过）、黑名单、单笔上限、当日累计金额/笔数，
 * 返回第一条命中的决策（block/review）；全部通过返回 pass。不抛异常，由调用方决定拦截/挂起。
 */
export async function evaluateRisk(input: RiskCheckInput): Promise<RiskDecision> {
  const tenantCond = input.tenantId == null ? isNull(paymentRiskRules.tenantId) : or(eq(paymentRiskRules.tenantId, input.tenantId), isNull(paymentRiskRules.tenantId));
  const rules = await db.select().from(paymentRiskRules).where(and(eq(paymentRiskRules.status, 'enabled'), tenantCond));
  const applicable = rules.filter((r) => ruleApplies(r, input));
  if (applicable.length === 0) return { action: 'pass' };

  const identifiers = identifiersOf(input);

  for (const rule of applicable) {
    // 白名单：任一标识命中则跳过本规则全部检查
    if ((rule.allowlist ?? []).length > 0 && identifiers.some((id) => rule.allowlist.includes(id))) continue;
    // 黑名单（openid / 用户ID / IP）
    const hitBlockValue = identifiers.find((id) => rule.blocklist.includes(id));
    if (rule.blocklist.length > 0 && hitBlockValue) {
      return { action: rule.action, rule, dimension: 'blocklist', dimensionValue: hitBlockValue, message: `命中风控黑名单（${rule.name}）` };
    }
    // 单笔上限
    if (rule.singleLimit != null && input.amount > rule.singleLimit) {
      return { action: rule.action, rule, dimension: 'single_limit', dimensionValue: `${input.amount} > ${rule.singleLimit}`, message: `单笔金额超过限额（${rule.name}）` };
    }
    // 当日累计金额 / 笔数（按规则作用域聚合当日已支付订单；未支付的 pending/paying 不计入，避免误伤正常下单）
    if (rule.dailyLimit != null || rule.dailyCountLimit != null) {
      const scopeConds = [gte(paymentOrders.paidAt, startOfToday()), inArray(paymentOrders.status, ['success', 'refunding', 'refunded'])];
      if (rule.scope === 'channel') scopeConds.push(eq(paymentOrders.channel, input.channel));
      if (rule.scope === 'bizType') scopeConds.push(eq(paymentOrders.bizType, input.bizType));
      const where = input.tenantId == null ? and(...scopeConds, isNull(paymentOrders.tenantId)) : and(...scopeConds, eq(paymentOrders.tenantId, input.tenantId));
      const [agg] = await db.select({ total: sql<number>`coalesce(sum(${paymentOrders.amount}),0)`, count: sql<number>`count(*)` }).from(paymentOrders).where(where);
      const dayTotal = Number(agg?.total ?? 0);
      const dayCount = Number(agg?.count ?? 0);
      if (rule.dailyLimit != null && dayTotal + input.amount > rule.dailyLimit) {
        return { action: rule.action, rule, dimension: 'daily_limit', dimensionValue: `${dayTotal} + ${input.amount} > ${rule.dailyLimit}`, message: `当日累计金额超过限额（${rule.name}）` };
      }
      if (rule.dailyCountLimit != null && dayCount + 1 > rule.dailyCountLimit) {
        return { action: rule.action, rule, dimension: 'daily_count', dimensionValue: `${dayCount} + 1 > ${rule.dailyCountLimit}`, message: `当日交易笔数超过限额（${rule.name}）` };
      }
    }
  }
  return { action: 'pass' };
}

// ─── 命中留痕 ─────────────────────────────────────────────────────────────────

function mapRiskHit(row: PaymentRiskHitRow): PaymentRiskHit {
  return {
    id: row.id,
    ruleId: row.ruleId ?? null,
    ruleName: row.ruleName,
    action: row.action,
    dimension: row.dimension,
    dimensionValue: row.dimensionValue ?? null,
    channel: row.channel,
    bizType: row.bizType,
    bizId: row.bizId,
    orderNo: row.orderNo ?? null,
    amount: row.amount,
    openId: row.openId ?? null,
    userId: row.userId ?? null,
    clientIp: row.clientIp ?? null,
    createdAt: formatDateTime(row.createdAt),
  };
}

/** 记录一次风控命中（block 无订单号；review 关联挂起订单号）。返回留痕 id。 */
export async function recordRiskHit(decision: Exclude<RiskDecision, { action: 'pass' }>, input: RiskCheckInput, orderNo?: string): Promise<number> {
  const [row] = await db
    .insert(paymentRiskHits)
    .values({
      ruleId: decision.rule.id,
      ruleName: decision.rule.name,
      action: decision.action,
      dimension: decision.dimension,
      dimensionValue: decision.dimensionValue.slice(0, 256),
      channel: input.channel,
      bizType: input.bizType,
      bizId: input.bizId,
      orderNo: orderNo ?? null,
      amount: input.amount,
      openId: input.openId ?? null,
      userId: input.userId ?? null,
      clientIp: input.clientIp ?? null,
      tenantId: input.tenantId ?? null,
    })
    .returning({ id: paymentRiskHits.id });
  return row.id;
}

export interface ListRiskHitsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  action?: 'block' | 'review';
  dimension?: PaymentRiskDimension;
  channel?: PaymentChannel;
  startTime?: string;
  endTime?: string;
}

export async function listRiskHits(q: ListRiskHitsQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.keyword) {
    const kw = `%${escapeLike(q.keyword)}%`;
    conds.push(or(like(paymentRiskHits.ruleName, kw), like(paymentRiskHits.bizId, kw), like(paymentRiskHits.orderNo, kw)));
  }
  if (q.action) conds.push(eq(paymentRiskHits.action, q.action));
  if (q.dimension) conds.push(eq(paymentRiskHits.dimension, q.dimension));
  if (q.channel) conds.push(eq(paymentRiskHits.channel, q.channel));
  const start = parseDateRangeStart(q.startTime);
  const end = parseDateRangeEnd(q.endTime);
  if (start) conds.push(gte(paymentRiskHits.createdAt, start));
  if (end) conds.push(lte(paymentRiskHits.createdAt, end));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentRiskHits, currentUser()));
  const [total, list] = await Promise.all([
    db.$count(paymentRiskHits, where),
    withPagination(db.select().from(paymentRiskHits).where(where).orderBy(desc(paymentRiskHits.id)).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapRiskHit), total, page, pageSize };
}

// ─── 人工审核队列 ─────────────────────────────────────────────────────────────

function genReviewNo(): string {
  return `RSK${Date.now()}${randomInt(1000, 9999)}`;
}

function mapRiskReview(row: PaymentRiskReviewRow & { reviewer?: { nickname: string | null } | null }): PaymentRiskReview {
  return {
    id: row.id,
    reviewNo: row.reviewNo,
    hitId: row.hitId ?? null,
    orderNo: row.orderNo,
    channel: row.channel,
    bizType: row.bizType,
    bizId: row.bizId,
    amount: row.amount,
    reason: row.reason,
    status: row.status,
    reviewerName: row.reviewer?.nickname ?? null,
    reviewedAt: formatNullableDateTime(row.reviewedAt),
    reviewRemark: row.reviewRemark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

/** 下单前置校验：同业务单存在待审核记录时禁止重复下单（等待审核结论） */
export async function assertNoPendingRiskReview(bizType: string, bizId: string): Promise<void> {
  const [row] = await db
    .select({ reviewNo: paymentRiskReviews.reviewNo })
    .from(paymentRiskReviews)
    .where(and(eq(paymentRiskReviews.bizType, bizType), eq(paymentRiskReviews.bizId, bizId), eq(paymentRiskReviews.status, 'pending')))
    .limit(1);
  if (row) throw new HTTPException(400, { message: `该交易正在风控人工审核中（审核单 ${row.reviewNo}），请等待审核结果` });
}

/** review 动作：为已落库的挂起订单创建审核单（订单不调渠道，支付窗口延长至 24h 等待审核） */
export async function suspendOrderForReview(order: PaymentOrderRow, decision: Exclude<RiskDecision, { action: 'pass' }>, input: RiskCheckInput): Promise<PaymentRiskReviewRow> {
  const hitId = await recordRiskHit(decision, input, order.orderNo);
  const [review] = await db
    .insert(paymentRiskReviews)
    .values({
      reviewNo: genReviewNo(),
      hitId,
      orderNo: order.orderNo,
      channel: order.channel,
      bizType: order.bizType,
      bizId: order.bizId,
      amount: order.amount,
      reason: `${decision.message}；${decision.dimensionValue}`.slice(0, 256),
      status: 'pending',
      tenantId: order.tenantId,
    })
    .returning();
  await db.update(paymentOrders).set({ expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).where(eq(paymentOrders.id, order.id));
  return review;
}

export interface ListRiskReviewsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: PaymentRiskReviewStatus;
  channel?: PaymentChannel;
}

export async function listRiskReviews(q: ListRiskReviewsQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.keyword) {
    const kw = `%${escapeLike(q.keyword)}%`;
    conds.push(or(like(paymentRiskReviews.reviewNo, kw), like(paymentRiskReviews.orderNo, kw), like(paymentRiskReviews.bizId, kw)));
  }
  if (q.status) conds.push(eq(paymentRiskReviews.status, q.status));
  if (q.channel) conds.push(eq(paymentRiskReviews.channel, q.channel));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentRiskReviews, currentUser()));
  const [total, rows] = await Promise.all([
    db.$count(paymentRiskReviews, where),
    db.query.paymentRiskReviews.findMany({
      where,
      with: { reviewer: { columns: { nickname: true } } },
      orderBy: desc(paymentRiskReviews.id),
      limit: pageSize,
      offset: pageOffset(page, pageSize),
    }),
  ]);
  return { list: rows.map(mapRiskReview), total, page, pageSize };
}

async function ensureRiskReview(id: number): Promise<PaymentRiskReviewRow> {
  const tc = tenantCondition(paymentRiskReviews, currentUser());
  const [row] = await db.select().from(paymentRiskReviews).where(and(eq(paymentRiskReviews.id, id), tc)).limit(1);
  if (!row) throw new HTTPException(404, { message: '审核单不存在' });
  return row;
}

/** 审计 before 数据（路由层用，不存在时返回 undefined 不抛错） */
export async function findRiskReviewById(id: number): Promise<PaymentRiskReviewRow | undefined> {
  const [row] = await db.select().from(paymentRiskReviews).where(eq(paymentRiskReviews.id, id)).limit(1);
  return row;
}

/**
 * 审核放行：审核单置 approved，挂起订单支付窗口再延长 24h；
 * 用户重新发起支付时业务幂等复用该订单继续调渠道（审核单已非 pending，不再拦截）。
 */
export async function approveRiskReview(id: number, remark?: string): Promise<PaymentRiskReview> {
  const row = await ensureRiskReview(id);
  if (row.status !== 'pending') throw new HTTPException(400, { message: '该审核单已处理' });
  const [updated] = await db
    .update(paymentRiskReviews)
    .set({ status: 'approved', reviewerId: currentUser().userId, reviewedAt: new Date(), reviewRemark: remark ?? null })
    .where(and(eq(paymentRiskReviews.id, id), eq(paymentRiskReviews.status, 'pending')))
    .returning();
  if (!updated) throw new HTTPException(400, { message: '该审核单已被并发处理' });
  await db
    .update(paymentOrders)
    .set({ expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    .where(and(eq(paymentOrders.orderNo, row.orderNo), inArray(paymentOrders.status, ['pending', 'paying'])));
  return mapRiskReview(updated);
}

/** 审核拒绝：审核单置 rejected 并本地关闭挂起订单（渠道侧从未下单，无需渠道关单） */
export async function rejectRiskReview(id: number, remark?: string): Promise<PaymentRiskReview> {
  const row = await ensureRiskReview(id);
  if (row.status !== 'pending') throw new HTTPException(400, { message: '该审核单已处理' });
  const [updated] = await db
    .update(paymentRiskReviews)
    .set({ status: 'rejected', reviewerId: currentUser().userId, reviewedAt: new Date(), reviewRemark: remark ?? null })
    .where(and(eq(paymentRiskReviews.id, id), eq(paymentRiskReviews.status, 'pending')))
    .returning();
  if (!updated) throw new HTTPException(400, { message: '该审核单已被并发处理' });

  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.orderNo, row.orderNo)).limit(1);
  if (order && (order.status === 'pending' || order.status === 'paying')) {
    const eventId = await db.transaction(async (tx) => {
      const closed = await tx
        .update(paymentOrders)
        .set({ status: 'closed', errorMessage: '风控审核拒绝' })
        .where(and(eq(paymentOrders.id, order.id), inArray(paymentOrders.status, ['pending', 'paying'])))
        .returning({ id: paymentOrders.id });
      if (closed.length === 0) return null;
      return recordEvent(tx, {
        type: 'payment.closed',
        orderNo: order.orderNo,
        tenantId: order.tenantId,
        payload: {
          type: 'payment.closed',
          orderNo: order.orderNo,
          outTradeNo: order.outTradeNo,
          bizType: order.bizType,
          bizId: order.bizId,
          channel: order.channel,
          amount: order.amount,
          userId: order.userId,
          tenantId: order.tenantId,
        },
      });
    });
    if (eventId != null) setImmediate(() => { void processEvent(eventId); });
  }
  return mapRiskReview(updated);
}
