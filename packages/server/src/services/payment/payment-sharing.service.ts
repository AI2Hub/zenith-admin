/**
 * 支付分账/分润 Service。
 * 维护分账接收方，针对成功订单发起单笔分账（走渠道 adapter.profitShare 模拟实现），
 * 状态机：pending → processing → success/failed，留存渠道分账单号。
 * 自动分账：订阅 payment.succeeded，对启用 autoShare 的接收方按 ratioBps 自动发起，
 * 确定性分账单号（SHR{orderNo}R{receiverId}）+ 唯一索引保证事件重复投递幂等；
 * 渠道调用失败的分账单由 cron retryFailedSharingOrders 兜底重试（上限 3 次）。
 */
import { and, desc, eq, isNull, like, lt, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { randomInt } from 'node:crypto';
import { db } from '../../db';
import {
  paymentOrders,
  paymentSharingOrders,
  paymentSharingReceivers,
  type PaymentOrderRow,
  type PaymentSharingOrderRow,
  type PaymentSharingReceiverRow,
} from '../../db/schema';
import { currentUser } from '../../lib/context';
import { getCreateTenantId, tenantCondition } from '../../lib/tenant';
import { mergeWhere, escapeLike, withPagination } from '../../lib/where-helpers';
import { formatDateTime, formatNullableDateTime } from '../../lib/datetime';
import { buildAdapterContext, loadOrderConfig } from './payment.service';
import { getAdapter } from '../../lib/payment/registry';
import { paymentEventBus } from '../../lib/payment-event-bus';
import logger from '../../lib/logger';
import type {
  CreatePaymentSharingReceiverInput,
  UpdatePaymentSharingReceiverInput,
  PaymentSharingOrder,
  PaymentSharingOrderStatus,
  PaymentSharingReceiver,
} from '@zenith/shared';

/** 单笔分账渠道调用次数上限（首次 + 重试） */
const MAX_SHARING_ATTEMPTS = 3;

function genNo(): string {
  return `SHR${Date.now()}${randomInt(1000, 9999)}`;
}

// ─── 接收方映射 + CRUD ────────────────────────────────────────────────────────
export function mapReceiver(row: PaymentSharingReceiverRow): PaymentSharingReceiver {
  return {
    id: row.id,
    name: row.name,
    receiverType: row.receiverType,
    account: row.account,
    ratioBps: row.ratioBps ?? null,
    autoShare: row.autoShare,
    status: row.status,
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export function mapSharingOrder(row: PaymentSharingOrderRow & { receiverName?: string | null }): PaymentSharingOrder {
  return {
    id: row.id,
    sharingNo: row.sharingNo,
    orderNo: row.orderNo,
    receiverId: row.receiverId,
    receiverName: row.receiverName ?? null,
    amount: row.amount,
    status: row.status,
    channelSharingNo: row.channelSharingNo ?? null,
    finishedAt: formatNullableDateTime(row.finishedAt),
    remark: row.remark ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export interface ListReceiversQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: 'enabled' | 'disabled';
}

export async function listReceivers(q: ListReceiversQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.keyword) conds.push(like(paymentSharingReceivers.name, `%${escapeLike(q.keyword)}%`));
  if (q.status) conds.push(eq(paymentSharingReceivers.status, q.status));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentSharingReceivers, currentUser()));
  const [total, list] = await Promise.all([
    db.$count(paymentSharingReceivers, where),
    withPagination(db.select().from(paymentSharingReceivers).where(where).orderBy(desc(paymentSharingReceivers.id)).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapReceiver), total, page, pageSize };
}

async function ensureReceiver(id: number): Promise<PaymentSharingReceiverRow> {
  const tc = tenantCondition(paymentSharingReceivers, currentUser());
  const [row] = await db.select().from(paymentSharingReceivers).where(and(eq(paymentSharingReceivers.id, id), tc)).limit(1);
  if (!row) throw new HTTPException(404, { message: '分账接收方不存在' });
  return row;
}

export async function getReceiver(id: number): Promise<PaymentSharingReceiver> {
  return mapReceiver(await ensureReceiver(id));
}

export async function createReceiver(input: CreatePaymentSharingReceiverInput): Promise<PaymentSharingReceiver> {
  const [row] = await db
    .insert(paymentSharingReceivers)
    .values({
      name: input.name,
      receiverType: input.receiverType ?? 'merchant',
      account: input.account,
      ratioBps: input.ratioBps ?? null,
      autoShare: input.autoShare ?? false,
      status: input.status ?? 'enabled',
      remark: input.remark ?? null,
      tenantId: getCreateTenantId(currentUser()),
    })
    .returning();
  return mapReceiver(row);
}

export async function updateReceiver(id: number, input: UpdatePaymentSharingReceiverInput): Promise<PaymentSharingReceiver> {
  await ensureReceiver(id);
  const set: Partial<PaymentSharingReceiverRow> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.receiverType !== undefined) set.receiverType = input.receiverType;
  if (input.account !== undefined) set.account = input.account;
  if (input.ratioBps !== undefined) set.ratioBps = input.ratioBps ?? null;
  if (input.autoShare !== undefined) set.autoShare = input.autoShare;
  if (input.status !== undefined) set.status = input.status;
  if (input.remark !== undefined) set.remark = input.remark ?? null;
  const tc = tenantCondition(paymentSharingReceivers, currentUser());
  const [row] = await db.update(paymentSharingReceivers).set(set).where(and(eq(paymentSharingReceivers.id, id), tc)).returning();
  return mapReceiver(row);
}

export async function deleteReceiver(id: number): Promise<void> {
  await ensureReceiver(id);
  await db.delete(paymentSharingReceivers).where(eq(paymentSharingReceivers.id, id));
}

// ─── 分账单 ───────────────────────────────────────────────────────────────────
export interface ListSharingOrdersQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: PaymentSharingOrderStatus;
  receiverId?: number;
}

export async function listSharingOrders(q: ListSharingOrdersQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 10;
  const conds = [];
  if (q.keyword) conds.push(like(paymentSharingOrders.orderNo, `%${escapeLike(q.keyword)}%`));
  if (q.status) conds.push(eq(paymentSharingOrders.status, q.status));
  if (q.receiverId) conds.push(eq(paymentSharingOrders.receiverId, q.receiverId));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentSharingOrders, currentUser()));
  const [total, rows] = await Promise.all([
    db.$count(paymentSharingOrders, where),
    db.query.paymentSharingOrders.findMany({
      where,
      orderBy: desc(paymentSharingOrders.id),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: { receiver: { columns: { name: true } } },
    }),
  ]);
  const list = rows.map((r) => mapSharingOrder({ ...r, receiverName: r.receiver?.name ?? null }));
  return { list, total, page, pageSize };
}

export interface DispatchSharingInput {
  orderNo: string;
  receiverId: number;
  amount?: number;
  remark?: string;
}

/** 发起单笔分账：校验订单已支付 + 接收方启用 → 创建分账单(processing) → 调渠道 → 落状态。 */
export async function dispatchSharing(input: DispatchSharingInput): Promise<PaymentSharingOrder> {
  const user = currentUser();
  const orderTc = tenantCondition(paymentOrders, user);
  const [order] = await db.select().from(paymentOrders).where(and(eq(paymentOrders.orderNo, input.orderNo), orderTc)).limit(1);
  if (!order) throw new HTTPException(404, { message: '支付订单不存在' });
  if (!['success', 'refunding', 'refunded'].includes(order.status)) {
    throw new HTTPException(400, { message: '仅支付成功的订单可发起分账' });
  }
  const receiver = await ensureReceiver(input.receiverId);
  if (receiver.status !== 'enabled') throw new HTTPException(400, { message: '分账接收方已停用' });

  const paid = order.paidAmount ?? order.amount;
  const amount = input.amount ?? (receiver.ratioBps != null ? Math.round((paid * receiver.ratioBps) / 10000) : 0);
  if (amount <= 0) throw new HTTPException(400, { message: '分账金额必须大于 0' });
  if (amount > paid) throw new HTTPException(400, { message: '分账金额不能超过订单实付金额' });

  const [created] = await db
    .insert(paymentSharingOrders)
    .values({
      sharingNo: genNo(),
      orderNo: order.orderNo,
      receiverId: receiver.id,
      amount,
      status: 'processing',
      remark: input.remark ?? null,
      tenantId: order.tenantId,
    })
    .returning();

  const updated = await executeSharingAtChannel(created, order, receiver);
  if (updated.row.status === 'failed') {
    if (updated.error instanceof HTTPException) throw updated.error;
    throw new HTTPException(502, { message: '渠道分账请求失败，可在分账列表中重试' });
  }
  return mapSharingOrder({ ...updated.row, receiverName: receiver.name });
}

/** 调渠道执行分账并落状态（不抛出渠道异常，统一转 failed + attempts 累加，供手动/自动/重试三路径复用）。 */
async function executeSharingAtChannel(
  sharing: PaymentSharingOrderRow,
  order: PaymentOrderRow,
  receiver: PaymentSharingReceiverRow,
): Promise<{ row: PaymentSharingOrderRow; error?: unknown }> {
  try {
    const config = await loadOrderConfig(order);
    if (!config) throw new HTTPException(400, { message: '支付渠道配置不存在，无法分账' });
    const adapter = getAdapter(order.channel);
    if (!adapter.profitShare) throw new HTTPException(400, { message: `渠道 ${order.channel} 暂不支持分账` });
    const res = await adapter.profitShare(buildAdapterContext(config), order, {
      account: receiver.account,
      amount: sharing.amount,
      name: receiver.name,
      receiverType: receiver.receiverType,
    });
    const status: PaymentSharingOrderStatus = res.status === 'success' ? 'success' : res.status === 'failed' ? 'failed' : 'processing';
    const [updated] = await db
      .update(paymentSharingOrders)
      .set({
        status,
        channelSharingNo: res.channelSharingNo ?? null,
        attempts: sharing.attempts + 1,
        finishedAt: status === 'success' || status === 'failed' ? new Date() : null,
      })
      .where(eq(paymentSharingOrders.id, sharing.id))
      .returning();
    return { row: updated };
  } catch (err) {
    logger.error('[payment-sharing] channel dispatch failed', { sharingNo: sharing.sharingNo, orderNo: order.orderNo, err });
    const [updated] = await db
      .update(paymentSharingOrders)
      .set({ status: 'failed', attempts: sharing.attempts + 1, finishedAt: new Date() })
      .where(eq(paymentSharingOrders.id, sharing.id))
      .returning();
    return { row: updated, error: err };
  }
}

// ─── 自动分账（payment.succeeded 订阅者）──────────────────────────────────────

/** 确定性分账单号：同订单同接收方全局唯一，配合 sharing_no 唯一约束实现事件重复投递幂等。 */
function autoSharingNo(orderNo: string, receiverId: number): string {
  return `SHR${orderNo}R${receiverId}`;
}

/** 支付成功后自动分账：对启用 autoShare 且配置了 ratioBps 的接收方逐个发起。
 * 幂等：确定性 sharingNo + onConflictDoNothing，重复事件不会重复建单；
 * 合计校验：所有自动分账金额之和不超过订单实付。 */
export async function autoShareOrder(orderNo: string): Promise<void> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.orderNo, orderNo)).limit(1);
  if (!order) return;
  if (!['success', 'refunding', 'refunded'].includes(order.status)) return;

  const tenantCond = order.tenantId == null
    ? isNull(paymentSharingReceivers.tenantId)
    : or(eq(paymentSharingReceivers.tenantId, order.tenantId), isNull(paymentSharingReceivers.tenantId));
  const receivers = await db
    .select()
    .from(paymentSharingReceivers)
    .where(and(eq(paymentSharingReceivers.status, 'enabled'), eq(paymentSharingReceivers.autoShare, true), tenantCond));
  if (receivers.length === 0) return;

  const paid = order.paidAmount ?? order.amount;
  let allocated = 0;
  for (const receiver of receivers) {
    if (receiver.ratioBps == null || receiver.ratioBps <= 0) continue;
    const amount = Math.round((paid * receiver.ratioBps) / 10000);
    if (amount <= 0) continue;
    if (allocated + amount > paid) {
      logger.warn('[payment-sharing] auto share skipped: total ratio exceeds paid amount', { orderNo, receiverId: receiver.id });
      continue;
    }
    allocated += amount;

    const [created] = await db
      .insert(paymentSharingOrders)
      .values({
        sharingNo: autoSharingNo(order.orderNo, receiver.id),
        orderNo: order.orderNo,
        receiverId: receiver.id,
        amount,
        status: 'processing',
        remark: '自动分账',
        tenantId: order.tenantId,
      })
      .onConflictDoNothing({ target: paymentSharingOrders.sharingNo })
      .returning();
    if (!created) continue; // 已建过（事件重复投递），由重试 cron 兜底失败单
    await executeSharingAtChannel(created, order, receiver);
  }
}

let sharingSubscribersRegistered = false;
/** 注册自动分账订阅者（支付成功后按接收方配置自动发起分账）。 */
export function registerSharingSubscribers(): void {
  if (sharingSubscribersRegistered) return;
  sharingSubscribersRegistered = true;
  paymentEventBus.on('payment.succeeded', (e) => {
    return autoShareOrder(e.orderNo).catch((err) => {
      logger.error('[payment-sharing] auto share failed', { orderNo: e.orderNo, err });
      throw err;
    });
  });
  logger.info('Payment sharing subscribers registered');
}

// ─── 失败分账重试（cron 兜底）────────────────────────────────────────────────

/** 重试渠道调用失败的分账单：仅处理 channelSharingNo 为空（渠道未受理）且未达尝试上限的 failed 单，
 * 防止渠道已受理的单被重复分账。返回扫描条数。 */
export async function retryFailedSharingOrders(): Promise<{ scanned: number; succeeded: number }> {
  const rows = await db
    .select()
    .from(paymentSharingOrders)
    .where(and(eq(paymentSharingOrders.status, 'failed'), isNull(paymentSharingOrders.channelSharingNo), lt(paymentSharingOrders.attempts, MAX_SHARING_ATTEMPTS)))
    .limit(50);
  let succeeded = 0;
  for (const sharing of rows) {
    const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.orderNo, sharing.orderNo)).limit(1);
    const [receiver] = await db.select().from(paymentSharingReceivers).where(eq(paymentSharingReceivers.id, sharing.receiverId)).limit(1);
    if (!order || !receiver) continue;
    if (receiver.status !== 'enabled') continue;
    const updated = await executeSharingAtChannel(sharing, order, receiver);
    if (updated.row.status === 'success') succeeded++;
  }
  return { scanned: rows.length, succeeded };
}
