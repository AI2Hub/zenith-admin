/**
 * 支付财务报表 Service。
 * 基于资金台账（payment_ledger_entries）按业务类型/渠道/日聚合，
 * 输出每组的收款(gross)/手续费(fee)/退款(refund)/净额(net)/成功笔数(count)。
 */
import { and, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { paymentLedgerEntries } from '../db/schema';
import { currentUser } from '../lib/context';
import { tenantCondition } from '../lib/tenant';
import { mergeWhere } from '../lib/where-helpers';
import { parseDateTimeInput } from '../lib/datetime';
import { PAYMENT_CHANNEL_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentReportGroupBy, PaymentReportRow } from '@zenith/shared';

export interface ReportSummaryQuery {
  groupBy?: PaymentReportGroupBy;
  startTime?: string;
  endTime?: string;
}

export interface ReportSummary {
  groupBy: PaymentReportGroupBy;
  rows: PaymentReportRow[];
  totalGross: number;
  totalFee: number;
  totalRefund: number;
  totalNet: number;
  totalCount: number;
}

function labelFor(groupBy: PaymentReportGroupBy, key: string): string {
  if (groupBy === 'channel') return PAYMENT_CHANNEL_LABELS[key as PaymentChannel] ?? key;
  return key;
}

export async function getReportSummary(q: ReportSummaryQuery): Promise<ReportSummary> {
  const groupBy: PaymentReportGroupBy = q.groupBy ?? 'bizType';
  const conds: SQL[] = [];
  const start = parseDateTimeInput(q.startTime);
  const end = parseDateTimeInput(q.endTime);
  if (start) conds.push(gte(paymentLedgerEntries.createdAt, start));
  if (end) conds.push(lte(paymentLedgerEntries.createdAt, end));
  const where = mergeWhere(conds.length ? and(...conds) : undefined, tenantCondition(paymentLedgerEntries, currentUser()));

  const keyExpr =
    groupBy === 'channel'
      ? sql<string>`coalesce(${paymentLedgerEntries.channel}::text, '未知')`
      : groupBy === 'bizType'
        ? sql<string>`coalesce(${paymentLedgerEntries.bizType}, '未知')`
        : sql<string>`to_char(${paymentLedgerEntries.createdAt}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      key: keyExpr,
      gross: sql<number>`coalesce(sum(case when ${paymentLedgerEntries.type} = 'payment' then ${paymentLedgerEntries.amount} else 0 end),0)`,
      fee: sql<number>`coalesce(sum(case when ${paymentLedgerEntries.type} = 'fee' then ${paymentLedgerEntries.amount} else 0 end),0)`,
      refund: sql<number>`coalesce(sum(case when ${paymentLedgerEntries.type} = 'refund' then ${paymentLedgerEntries.amount} else 0 end),0)`,
      count: sql<number>`coalesce(sum(case when ${paymentLedgerEntries.type} = 'payment' then 1 else 0 end),0)`,
    })
    .from(paymentLedgerEntries)
    .where(where)
    .groupBy(keyExpr)
    .orderBy(keyExpr);

  const reportRows: PaymentReportRow[] = rows.map((r) => {
    const gross = Number(r.gross);
    const fee = Number(r.fee);
    const refund = Number(r.refund);
    return { key: r.key, label: labelFor(groupBy, r.key), gross, fee, refund, net: gross - fee - refund, count: Number(r.count) };
  });

  return {
    groupBy,
    rows: reportRows,
    totalGross: reportRows.reduce((s, r) => s + r.gross, 0),
    totalFee: reportRows.reduce((s, r) => s + r.fee, 0),
    totalRefund: reportRows.reduce((s, r) => s + r.refund, 0),
    totalNet: reportRows.reduce((s, r) => s + r.net, 0),
    totalCount: reportRows.reduce((s, r) => s + r.count, 0),
  };
}
