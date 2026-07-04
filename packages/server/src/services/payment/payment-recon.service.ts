/**
 * 支付对账中心 Service。
 * 上传渠道对账单（CSV），与本地订单逐笔比对，生成差异报表
 * （一致 / 本地有渠道无 / 渠道有本地无 / 金额不一致）。
 * 差异处理流：差异项创建时置 handleStatus=pending，人工处理流转为 已调账/挂账/已忽略。
 * 自动对账：sandbox 渠道用本地订单生成模拟账单（演示闭环），真实渠道调 adapter.downloadBill 拉取渠道账单。
 */
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { randomInt } from 'node:crypto';
import { db } from '../../db';
import {
  paymentChannelConfigs,
  paymentOrders,
  paymentReconBatches,
  paymentReconItems,
  type PaymentReconBatchRow,
  type PaymentReconItemRow,
} from '../../db/schema';
import { currentUser } from '../../lib/context';
import { getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { mergeWhere, withPagination } from '../../lib/where-helpers';
import { formatDate, formatDateTime, formatNullableDateTime, parseDateTimeInput } from '../../lib/datetime';
import { recordLedgerEntry } from './payment-ledger.service';
import { buildAdapterContext } from './payment.service';
import { getAdapter } from '../../lib/payment/registry';
import logger from '../../lib/logger';
import type { SQL } from 'drizzle-orm';
import type { HandlePaymentReconItemInput, PaymentChannel, PaymentReconBatch, PaymentReconHandleStatus, PaymentReconItem, PaymentReconResult, PaymentReconStatus } from '@zenith/shared';

function genNo(prefix: string): string {
  return `${prefix}${Date.now()}${randomInt(1000, 9999)}`;
}

export function mapReconBatch(row: PaymentReconBatchRow): PaymentReconBatch {
  return {
    id: row.id,
    batchNo: row.batchNo,
    channel: row.channel,
    billDate: row.billDate,
    status: row.status,
    localCount: row.localCount,
    localAmount: row.localAmount,
    channelCount: row.channelCount,
    channelAmount: row.channelAmount,
    matchedCount: row.matchedCount,
    diffCount: row.diffCount,
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export function mapReconItem(row: PaymentReconItemRow): PaymentReconItem {
  return {
    id: row.id,
    batchId: row.batchId,
    orderNo: row.orderNo ?? null,
    channelTradeNo: row.channelTradeNo ?? null,
    localAmount: row.localAmount ?? null,
    channelAmount: row.channelAmount ?? null,
    localStatus: row.localStatus ?? null,
    channelStatus: row.channelStatus ?? null,
    result: row.result,
    handleStatus: row.handleStatus ?? null,
    handleRemark: row.handleRemark ?? null,
    handledAt: formatNullableDateTime(row.handledAt),
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
  };
}

interface ChannelRecord {
  orderNo: string;
  channelTradeNo?: string;
  amount: number;
  status: string;
}

const CHANNEL_BILL_STATUSES = new Set(['success', 'succeeded', 'paid', 'closed', 'failed', 'refund', 'refunded', 'processing']);
const MAX_BILL_AMOUNT = 999_999_999_999;

/** 解析渠道对账单 CSV：每行 `订单号,渠道交易号,金额(分),状态`。跳过表头与空行。 */
export function parseChannelBill(text: string): ChannelRecord[] {
  const out: ChannelRecord[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());
    const lineNo = index + 1;
    if (cols.length < 3) throw new HTTPException(400, { message: `渠道账单第 ${lineNo} 行字段不足` });
    const orderNo = cols[0];
    if (!orderNo || /^(订单号|order_?no|out_?trade_?no)$/i.test(orderNo)) continue;
    if (!/^\d+$/.test(cols[2])) throw new HTTPException(400, { message: `渠道账单第 ${lineNo} 行金额必须为整数分` });
    const amount = Number(cols[2]);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_BILL_AMOUNT) {
      throw new HTTPException(400, { message: `渠道账单第 ${lineNo} 行金额超出有效范围` });
    }
    const status = (cols[3] || 'success').trim();
    if (!CHANNEL_BILL_STATUSES.has(status.toLowerCase())) {
      throw new HTTPException(400, { message: `渠道账单第 ${lineNo} 行状态无效：${status}` });
    }
    out.push({ orderNo, channelTradeNo: cols[1] || undefined, amount, status });
  }
  return out;
}

async function loadLocalPaidRowsScoped(channel: PaymentChannel, billDate: string, orderWhere?: SQL) {
  const start = parseDateTimeInput(`${billDate} 00:00:00`);
  const end = parseDateTimeInput(`${billDate} 23:59:59`);
  return db
    .select({
      orderNo: paymentOrders.orderNo,
      channelTradeNo: paymentOrders.channelTradeNo,
      paidAmount: paymentOrders.paidAmount,
      amount: paymentOrders.amount,
      status: paymentOrders.status,
    })
    .from(paymentOrders)
    .where(
      mergeWhere(
        and(
          eq(paymentOrders.channel, channel),
          inArray(paymentOrders.status, ['success', 'refunding', 'refunded']),
          start ? gte(paymentOrders.paidAt, start) : undefined,
          end ? lte(paymentOrders.paidAt, end) : undefined,
        ),
        orderWhere,
      ),
    );
}

async function loadLocalPaidRows(channel: PaymentChannel, billDate: string) {
  return loadLocalPaidRowsScoped(channel, billDate, tenantCondition(paymentOrders, currentUser()));
}

export interface ListReconBatchesQuery {
  page?: number;
  pageSize?: number;
  channel?: PaymentChannel;
  status?: PaymentReconStatus;
}

export async function listReconBatches(q: ListReconBatchesQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.channel) conds.push(eq(paymentReconBatches.channel, q.channel));
  if (q.status) conds.push(eq(paymentReconBatches.status, q.status));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentReconBatches, currentUser()));
  const [total, list] = await Promise.all([
    db.$count(paymentReconBatches, where),
    withPagination(db.select().from(paymentReconBatches).where(where).orderBy(desc(paymentReconBatches.id)).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapReconBatch), total, page, pageSize };
}

export async function getReconBatch(id: number): Promise<PaymentReconBatch> {
  const tc = tenantCondition(paymentReconBatches, currentUser());
  const [row] = await db.select().from(paymentReconBatches).where(and(eq(paymentReconBatches.id, id), tc)).limit(1);
  if (!row) throw new HTTPException(404, { message: '对账批次不存在' });
  return mapReconBatch(row);
}

export interface ListReconItemsQuery {
  page?: number;
  pageSize?: number;
  result?: PaymentReconResult;
  handleStatus?: PaymentReconHandleStatus;
}

export async function listReconItems(batchId: number, q: ListReconItemsQuery) {
  await getReconBatch(batchId);
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  const conds = [eq(paymentReconItems.batchId, batchId)];
  if (q.result) conds.push(eq(paymentReconItems.result, q.result));
  if (q.handleStatus) conds.push(eq(paymentReconItems.handleStatus, q.handleStatus));
  const where = and(...conds);
  const [total, list] = await Promise.all([
    db.$count(paymentReconItems, where),
    withPagination(db.select().from(paymentReconItems).where(where).orderBy(desc(paymentReconItems.id)).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapReconItem), total, page, pageSize };
}

export interface CreateReconInput {
  channel: PaymentChannel;
  billDate: string;
  billText: string;
  remark?: string;
}

/** 创建对账批次（路由入口）：按当前登录用户租户口径。 */
export async function createReconBatch(input: CreateReconInput): Promise<PaymentReconBatch> {
  const user = currentUser();
  return createReconBatchScoped(input, { tenantId: getCreateTenantId(user), orderWhere: tenantCondition(paymentOrders, user) });
}

interface ReconScope {
  /** 批次归属租户 */
  tenantId: number | null;
  /** 本地订单聚合的租户过滤（undefined = 不过滤） */
  orderWhere?: SQL;
}

/** 对账核心：解析渠道账单 + 拉本地订单 + 逐笔比对 + 落库统计。不依赖请求上下文，供路由与定时任务复用。 */
async function createReconBatchScoped(input: CreateReconInput, scope: ReconScope): Promise<PaymentReconBatch> {
  const channelRecords = parseChannelBill(input.billText);
  const localRows = await loadLocalPaidRowsScoped(input.channel, input.billDate, scope.orderWhere);

  const localMap = new Map(localRows.map((r) => [r.orderNo, { amount: r.paidAmount ?? r.amount, status: r.status, channelTradeNo: r.channelTradeNo }]));
  const channelMap = new Map(channelRecords.map((r) => [r.orderNo, r]));

  const items: Array<Omit<typeof paymentReconItems.$inferInsert, 'batchId'>> = [];
  let matched = 0;
  let localAmount = 0;
  let channelAmount = 0;
  for (const orderNo of new Set([...localMap.keys(), ...channelMap.keys()])) {
    const local = localMap.get(orderNo);
    const ch = channelMap.get(orderNo);
    if (local) localAmount += local.amount;
    if (ch) channelAmount += ch.amount;
    let result: PaymentReconResult;
    if (local && ch) result = local.amount === ch.amount ? 'matched' : 'amount_diff';
    else if (local) result = 'local_only';
    else result = 'channel_only';
    if (result === 'matched') matched++;
    items.push({
      orderNo,
      channelTradeNo: ch?.channelTradeNo ?? local?.channelTradeNo ?? null,
      localAmount: local?.amount ?? null,
      channelAmount: ch?.amount ?? null,
      localStatus: local?.status ?? null,
      channelStatus: ch?.status ?? null,
      result,
      handleStatus: result === 'matched' ? null : 'pending', // 差异项进入待处理队列
      remark: null,
    });
  }

  const batchNo = genNo('RECON');
  const diffCount = items.length - matched;
  const row = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(paymentReconBatches)
      .values({
        batchNo,
        channel: input.channel,
        billDate: input.billDate,
        status: 'done',
        localCount: localMap.size,
        localAmount,
        channelCount: channelMap.size,
        channelAmount,
        matchedCount: matched,
        diffCount,
        remark: input.remark ?? null,
        tenantId: scope.tenantId,
      })
      .returning();
    if (items.length > 0) {
      await tx.insert(paymentReconItems).values(items.map((it) => ({ ...it, batchId: batch.id })));
    }
    return batch;
  });
  return mapReconBatch(row);
}

export async function deleteReconBatch(id: number): Promise<void> {
  await getReconBatch(id);
  await db.delete(paymentReconBatches).where(eq(paymentReconBatches.id, id));
}

// ─── 差异处理流 ───────────────────────────────────────────────────────────────

/** 按差异类型推导调账方向与金额：金额不一致按差额；渠道单边按渠道金额入账；本地单边按本地金额出账。 */
export function computeAdjustment(item: Pick<PaymentReconItemRow, 'result' | 'localAmount' | 'channelAmount'>): { direction: 'in' | 'out'; amount: number } | null {
  if (item.result === 'amount_diff' && item.localAmount != null && item.channelAmount != null) {
    const delta = item.channelAmount - item.localAmount;
    if (delta === 0) return null;
    return { direction: delta > 0 ? 'in' : 'out', amount: Math.abs(delta) };
  }
  if (item.result === 'channel_only' && item.channelAmount != null && item.channelAmount > 0) {
    return { direction: 'in', amount: item.channelAmount };
  }
  if (item.result === 'local_only' && item.localAmount != null && item.localAmount > 0) {
    return { direction: 'out', amount: item.localAmount };
  }
  return null;
}

/** 处理对账差异项：pending → adjusted/suspended/ignored（条件更新防重复处理）。
 * 选择「已调账」时按差异金额自动记一条资金台账（type=adjust），完成资金闭环。 */
export async function handleReconItem(itemId: number, input: HandlePaymentReconItemInput): Promise<PaymentReconItem> {
  const user = currentUser();
  const [item] = await db.select().from(paymentReconItems).where(eq(paymentReconItems.id, itemId)).limit(1);
  if (!item) throw new HTTPException(404, { message: '对账明细不存在' });
  const tc = tenantCondition(paymentReconBatches, user);
  const [batch] = await db.select().from(paymentReconBatches).where(and(eq(paymentReconBatches.id, item.batchId), tc)).limit(1);
  if (!batch) throw new HTTPException(404, { message: '对账批次不存在' });
  if (item.handleStatus == null) throw new HTTPException(400, { message: '该明细比对一致，无需处理' });

  const [updated] = await db
    .update(paymentReconItems)
    .set({ handleStatus: input.action, handleRemark: input.remark ?? null, handledAt: new Date(), handledById: user.userId })
    .where(and(eq(paymentReconItems.id, itemId), eq(paymentReconItems.handleStatus, 'pending')))
    .returning();
  if (!updated) throw new HTTPException(400, { message: '该差异已被处理，请刷新后查看' });

  if (input.action === 'adjusted') {
    const adj = computeAdjustment(item);
    if (adj) {
      await recordLedgerEntry({
        direction: adj.direction,
        type: 'adjust',
        amount: adj.amount,
        orderNo: item.orderNo,
        channel: batch.channel,
        tenantId: batch.tenantId,
        remark: `对账调账（批次 ${batch.batchNo}）${input.remark ? `：${input.remark}` : ''}`,
      });
    }
  }
  return mapReconItem(updated);
}

/** Demo/演示：用本地订单生成一份带表头的模拟渠道账单 CSV（金额取实付）。 */
export async function generateSampleBill(channel: PaymentChannel, billDate: string): Promise<string> {
  const rows = await loadLocalPaidRows(channel, billDate);
  const lines = ['订单号,渠道交易号,金额(分),状态'];
  for (const r of rows) {
    lines.push(`${r.orderNo},${r.channelTradeNo ?? ''},${r.paidAmount ?? r.amount},SUCCESS`);
  }
  return lines.join('\n');
}

// ─── 自动对账（拉取渠道账单）──────────────────────────────────────────────────

async function resolveReconConfig(channel: PaymentChannel) {
  const [preferred] = await db
    .select()
    .from(paymentChannelConfigs)
    .where(and(eq(paymentChannelConfigs.channel, channel), eq(paymentChannelConfigs.status, 'enabled'), eq(paymentChannelConfigs.isDefault, true)))
    .limit(1);
  if (preferred) return preferred;
  const [anyEnabled] = await db
    .select()
    .from(paymentChannelConfigs)
    .where(and(eq(paymentChannelConfigs.channel, channel), eq(paymentChannelConfigs.status, 'enabled')))
    .limit(1);
  return anyEnabled ?? null;
}

/** 自动拉取渠道账单并对账：sandbox 渠道用本地订单生成模拟账单（演示可闭环），
 * 真实渠道调 adapter.downloadBill（微信 tradebill；支付宝暂不支持自动拉取）。 */
export async function autoReconcile(channel: PaymentChannel, billDate: string, scope: ReconScope): Promise<PaymentReconBatch> {
  const config = await resolveReconConfig(channel);
  if (!config) throw new HTTPException(400, { message: `渠道 ${channel} 无启用配置，无法自动对账` });

  let billText: string;
  let source: string;
  if (config.sandbox) {
    const rows = await loadLocalPaidRowsScoped(channel, billDate, scope.orderWhere);
    const lines = ['订单号,渠道交易号,金额(分),状态'];
    for (const r of rows) lines.push(`${r.orderNo},${r.channelTradeNo ?? ''},${r.paidAmount ?? r.amount},SUCCESS`);
    billText = lines.join('\n');
    source = '自动对账（沙箱模拟账单）';
  } else {
    const adapter = getAdapter(channel);
    if (!adapter.downloadBill) throw new HTTPException(400, { message: `渠道 ${channel} 暂不支持自动拉取账单，请手动上传` });
    billText = await adapter.downloadBill(buildAdapterContext(config), billDate);
    source = '自动对账（渠道账单）';
  }
  return createReconBatchScoped({ channel, billDate, billText, remark: source }, scope);
}

/** 路由入口：按当前登录用户租户口径自动对账。 */
export async function autoReconcileForCurrentUser(channel: PaymentChannel, billDate: string): Promise<PaymentReconBatch> {
  const user = currentUser();
  return autoReconcile(channel, billDate, { tenantId: getCreateTenantId(user), orderWhere: tenantCondition(paymentOrders, user) });
}

/** Cron：为昨日账期按渠道自动对账（全局口径）。当日已存在该渠道账期批次则跳过，避免重复。 */
export async function autoReconcileYesterday(): Promise<{ generated: number; skipped: number }> {
  const billDate = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  let generated = 0;
  let skipped = 0;
  for (const channel of ['wechat', 'alipay'] as const) {
    const config = await resolveReconConfig(channel);
    if (!config) {
      skipped++;
      continue;
    }
    const exists = await db.$count(
      paymentReconBatches,
      and(eq(paymentReconBatches.channel, channel), eq(paymentReconBatches.billDate, billDate), isNull(paymentReconBatches.tenantId)),
    );
    if (exists > 0) {
      skipped++;
      continue;
    }
    try {
      await autoReconcile(channel, billDate, { tenantId: null });
      generated++;
    } catch (err) {
      skipped++;
      logger.warn('[payment-recon] auto reconcile skipped', { channel, billDate, err: err instanceof Error ? err.message : err });
    }
  }
  return { generated, skipped };
}
