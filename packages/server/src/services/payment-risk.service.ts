/**
 * 支付风控限额 Service。
 * 维护风控规则（全局/按渠道/按业务类型），下单前校验单笔上限、当日累计金额/笔数、黑名单，
 * 命中规则即拦截下单（HTTPException 400）。
 */
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { paymentOrders, paymentRiskRules, type PaymentRiskRuleRow } from '../db/schema';
import { currentUser } from '../lib/context';
import { getCreateTenantId, tenantCondition } from '../lib/tenant';
import { mergeWhere, withPagination } from '../lib/where-helpers';
import { formatDateTime } from '../lib/datetime';
import type { CreatePaymentRiskRuleInput, UpdatePaymentRiskRuleInput } from '@zenith/shared';
import type { PaymentChannel, PaymentRiskRule, PaymentRiskScope } from '@zenith/shared';

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

// ─── 下单风控校验 ─────────────────────────────────────────────────────────────
export interface RiskCheckInput {
  channel: PaymentChannel;
  bizType: string;
  amount: number;
  openId?: string | null;
  userId?: number | null;
  tenantId?: number | null;
}

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

/** 下单前风控校验：命中任一启用规则的限制即抛 HTTPException(400)。 */
export async function assertWithinRiskLimits(input: RiskCheckInput): Promise<void> {
  const tenantCond = input.tenantId == null ? isNull(paymentRiskRules.tenantId) : or(eq(paymentRiskRules.tenantId, input.tenantId), isNull(paymentRiskRules.tenantId));
  const rules = await db.select().from(paymentRiskRules).where(and(eq(paymentRiskRules.status, 'enabled'), tenantCond));
  const applicable = rules.filter((r) => ruleApplies(r, input));
  if (applicable.length === 0) return;

  const identifiers = [input.openId, input.userId != null ? String(input.userId) : null].filter((v): v is string => !!v);

  for (const rule of applicable) {
    // 黑名单（openId / userId）
    if (rule.blocklist.length > 0 && identifiers.some((id) => rule.blocklist.includes(id))) {
      throw new HTTPException(400, { message: `命中风控黑名单（${rule.name}）` });
    }
    // 单笔上限
    if (rule.singleLimit != null && input.amount > rule.singleLimit) {
      throw new HTTPException(400, { message: `单笔金额超过限额（${rule.name}）` });
    }
    // 当日累计金额 / 笔数（按规则作用域聚合当日成功+处理中订单）
    if (rule.dailyLimit != null || rule.dailyCountLimit != null) {
      const scopeConds = [gte(paymentOrders.createdAt, startOfToday()), inArray(paymentOrders.status, ['paying', 'success', 'refunding', 'refunded'])];
      if (rule.scope === 'channel') scopeConds.push(eq(paymentOrders.channel, input.channel));
      if (rule.scope === 'bizType') scopeConds.push(eq(paymentOrders.bizType, input.bizType));
      const where = input.tenantId == null ? and(...scopeConds, isNull(paymentOrders.tenantId)) : and(...scopeConds, eq(paymentOrders.tenantId, input.tenantId));
      const [agg] = await db.select({ total: sql<number>`coalesce(sum(${paymentOrders.amount}),0)`, count: sql<number>`count(*)` }).from(paymentOrders).where(where);
      const dayTotal = Number(agg?.total ?? 0);
      const dayCount = Number(agg?.count ?? 0);
      if (rule.dailyLimit != null && dayTotal + input.amount > rule.dailyLimit) {
        throw new HTTPException(400, { message: `当日累计金额超过限额（${rule.name}）` });
      }
      if (rule.dailyCountLimit != null && dayCount + 1 > rule.dailyCountLimit) {
        throw new HTTPException(400, { message: `当日交易笔数超过限额（${rule.name}）` });
      }
    }
  }
}
