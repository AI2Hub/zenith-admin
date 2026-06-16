/**
 * 支付统计与导出 Service。
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { paymentOrders, paymentRefunds } from '../db/schema';
import { currentUser } from '../lib/context';
import { tenantCondition } from '../lib/tenant';
import { mergeWhere } from '../lib/where-helpers';
import { streamToExcel, streamToCsv, formatDateTimeForExcel, type ExcelColumn } from '../lib/excel-export';
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_ORDER_STATUS_LABELS,
  PAYMENT_REFUND_STATUS_LABELS,
} from '@zenith/shared';
import type { PaymentChannel, PaymentMethod, PaymentOrderStatus, PaymentRefundStatus } from '@zenith/shared';
import { buildOrdersWhere, buildRefundsWhere, type ListOrdersQuery, type ListRefundsQuery } from './payment.service';

const EXPORT_LIMIT = 50000;

export interface PaymentStats {
  /** 累计成功金额（分） */
  totalAmount: number;
  /** 今日成功金额（分） */
  todayAmount: number;
  orderCount: number;
  successCount: number;
  /** 累计退款金额（分） */
  refundAmount: number;
  byChannel: { channel: string; count: number; amount: number }[];
  byStatus: { status: string; count: number }[];
}

export async function getPaymentStats(): Promise<PaymentStats> {
  const user = currentUser();
  const tc = tenantCondition(paymentOrders, user);
  const rtc = tenantCondition(paymentRefunds, user);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const PAID_STATUSES = ['success', 'refunding', 'refunded'] as const;
  const [totals, todayRow, byStatusRows, byChannelRows, refundTotal] = await Promise.all([
    db
      .select({
        totalAmount: sql<number>`coalesce(sum(case when ${paymentOrders.status} in ('success','refunding','refunded') then ${paymentOrders.amount} else 0 end),0)`,
        orderCount: sql<number>`count(*)`,
        successCount: sql<number>`count(*) filter (where ${paymentOrders.status} in ('success','refunding','refunded'))`,
      })
      .from(paymentOrders)
      .where(tc),
    db
      .select({ amount: sql<number>`coalesce(sum(${paymentOrders.amount}),0)` })
      .from(paymentOrders)
      .where(mergeWhere(and(inArray(paymentOrders.status, [...PAID_STATUSES]), gte(paymentOrders.paidAt, todayStart)), tc)),
    db.select({ status: paymentOrders.status, count: sql<number>`count(*)` }).from(paymentOrders).where(tc).groupBy(paymentOrders.status),
    db
      .select({
        channel: paymentOrders.channel,
        count: sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(case when ${paymentOrders.status} in ('success','refunding','refunded') then ${paymentOrders.amount} else 0 end),0)`,
      })
      .from(paymentOrders)
      .where(tc)
      .groupBy(paymentOrders.channel),
    db.select({ amount: sql<number>`coalesce(sum(${paymentRefunds.refundAmount}),0)` }).from(paymentRefunds).where(mergeWhere(eq(paymentRefunds.status, 'success'), rtc)),
  ]);

  return {
    totalAmount: Number(totals[0]?.totalAmount ?? 0),
    todayAmount: Number(todayRow[0]?.amount ?? 0),
    orderCount: Number(totals[0]?.orderCount ?? 0),
    successCount: Number(totals[0]?.successCount ?? 0),
    refundAmount: Number(refundTotal[0]?.amount ?? 0),
    byChannel: byChannelRows.map((r) => ({ channel: r.channel, count: Number(r.count), amount: Number(r.amount) })),
    byStatus: byStatusRows.map((r) => ({ status: r.status, count: Number(r.count) })),
  };
}

const yuan = (v: unknown): string => ((Number(v) || 0) / 100).toFixed(2);

const ORDER_COLUMNS: ExcelColumn[] = [
  { key: 'orderNo', header: '订单号', width: 22 },
  { key: 'outTradeNo', header: '商户单号', width: 22 },
  { key: 'channelTradeNo', header: '渠道交易号', width: 24, transform: (v) => (v as string) ?? '' },
  { key: 'subject', header: '标题', width: 24 },
  { key: 'amount', header: '金额(元)', width: 12, transform: yuan },
  { key: 'channel', header: '渠道', width: 10, transform: (v) => PAYMENT_CHANNEL_LABELS[v as PaymentChannel] ?? String(v ?? '') },
  { key: 'payMethod', header: '支付方式', width: 14, transform: (v) => PAYMENT_METHOD_LABELS[v as PaymentMethod] ?? String(v ?? '') },
  { key: 'status', header: '状态', width: 10, transform: (v) => PAYMENT_ORDER_STATUS_LABELS[v as PaymentOrderStatus] ?? String(v ?? '') },
  { key: 'bizType', header: '业务类型', width: 14 },
  { key: 'bizId', header: '业务ID', width: 14 },
  { key: 'paidAt', header: '支付时间', width: 20, transform: (v) => formatDateTimeForExcel(v as Date | null) },
  { key: 'createdAt', header: '创建时间', width: 20, transform: (v) => formatDateTimeForExcel(v as Date) },
];

const REFUND_COLUMNS: ExcelColumn[] = [
  { key: 'refundNo', header: '退款单号', width: 22 },
  { key: 'orderNo', header: '原订单号', width: 22 },
  { key: 'channelRefundNo', header: '渠道退款号', width: 22, transform: (v) => (v as string) ?? '' },
  { key: 'refundAmount', header: '退款金额(元)', width: 14, transform: yuan },
  { key: 'totalAmount', header: '原单金额(元)', width: 14, transform: yuan },
  { key: 'channel', header: '渠道', width: 10, transform: (v) => PAYMENT_CHANNEL_LABELS[v as PaymentChannel] ?? String(v ?? '') },
  { key: 'status', header: '状态', width: 10, transform: (v) => PAYMENT_REFUND_STATUS_LABELS[v as PaymentRefundStatus] ?? String(v ?? '') },
  { key: 'reason', header: '退款原因', width: 24, transform: (v) => (v as string) ?? '' },
  { key: 'refundedAt', header: '退款时间', width: 20, transform: (v) => formatDateTimeForExcel(v as Date | null) },
  { key: 'createdAt', header: '创建时间', width: 20, transform: (v) => formatDateTimeForExcel(v as Date) },
];

export async function exportOrders(q: ListOrdersQuery): Promise<ReadableStream> {
  const where = await buildOrdersWhere(q);
  const rows = await db.select().from(paymentOrders).where(where).orderBy(desc(paymentOrders.id)).limit(EXPORT_LIMIT);
  return streamToExcel(ORDER_COLUMNS, rows as unknown as Record<string, unknown>[], '支付订单');
}

export async function exportOrdersCsv(q: ListOrdersQuery): Promise<ReadableStream> {
  const where = await buildOrdersWhere(q);
  const rows = await db.select().from(paymentOrders).where(where).orderBy(desc(paymentOrders.id)).limit(EXPORT_LIMIT);
  return streamToCsv(ORDER_COLUMNS, rows as unknown as Record<string, unknown>[]);
}

export async function exportRefunds(q: ListRefundsQuery): Promise<ReadableStream> {
  const where = buildRefundsWhere(q);
  const rows = await db.select().from(paymentRefunds).where(where).orderBy(desc(paymentRefunds.id)).limit(EXPORT_LIMIT);
  return streamToExcel(REFUND_COLUMNS, rows as unknown as Record<string, unknown>[], '退款记录');
}

export async function exportRefundsCsv(q: ListRefundsQuery): Promise<ReadableStream> {
  const where = buildRefundsWhere(q);
  const rows = await db.select().from(paymentRefunds).where(where).orderBy(desc(paymentRefunds.id)).limit(EXPORT_LIMIT);
  return streamToCsv(REFUND_COLUMNS, rows as unknown as Record<string, unknown>[]);
}
