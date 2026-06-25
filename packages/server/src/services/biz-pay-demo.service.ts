/**
 * 业务接入示例：支付接入 Service
 *
 * 演示「业务模块如何对接支付中心」的标准三步：
 *   1) 业务自有实体落库（biz_pay_demos，状态 pending）；
 *   2) 发起支付：调用统一支付门面 createPayment（bizType='biz_pay_demo'），
 *      回填 paymentOrderNo 并置 paying，返回二维码 / 跳转链接给前端；
 *   3) 监听 paymentEventBus 'payment.succeeded'（见 biz-pay-demo-subscribers）按
 *      bizType 过滤后履约：markBizPayDemoPaid 幂等置 paid 并发放示例权益。
 *
 * 「模拟支付成功」为演示专用：通过 paymentEventBus.dispatch 同步驱动真实订阅器，
 * 使「下单 → 支付成功 → 履约」闭环在未配置真实微信/支付宝渠道时也能跑通。
 */
import { and, desc, eq, like } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { BizPayDemo, BizPayDemoStatus, PaymentMethod, CreatePaymentResult } from '@zenith/shared';
import { db } from '../db';
import { bizPayDemos, type BizPayDemoRow } from '../db/schema';
import { currentUser } from '../lib/context';
import { formatDateTime, formatNullableDateTime } from '../lib/datetime';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { escapeLike } from '../lib/where-helpers';
import { pageOffset } from '../lib/pagination';
import logger from '../lib/logger';
import { paymentEventBus } from '../lib/payment-event-bus';
import { createPayment } from './payment.service';

/** 业务类型标识（与订阅器、支付门面 bizType 保持一致） */
export const BIZ_PAY_DEMO_TYPE = 'biz_pay_demo';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapBizPayDemo(row: BizPayDemoRow): BizPayDemo {
  return {
    id: row.id,
    subject: row.subject,
    amount: row.amount,
    payMethod: (row.payMethod ?? null) as PaymentMethod | null,
    status: row.status,
    paymentOrderNo: row.paymentOrderNo ?? null,
    paidAt: formatNullableDateTime(row.paidAt),
    fulfillRemark: row.fulfillRemark ?? null,
    tenantId: row.tenantId,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

// ─── 前置校验 ─────────────────────────────────────────────────────────────────

/** 仅本人可操作自己的示例单 */
function findOwn(id: number) {
  const user = currentUser();
  const conds = [eq(bizPayDemos.id, id), eq(bizPayDemos.createdBy, user.userId)];
  const tc = tenantCondition(bizPayDemos, user);
  if (tc) conds.push(tc);
  return and(...conds);
}

async function getOwnRow(id: number): Promise<BizPayDemoRow> {
  const [row] = await db.select().from(bizPayDemos).where(findOwn(id)).limit(1);
  if (!row) throw new HTTPException(404, { message: '示例单不存在' });
  return row;
}

// ─── 业务逻辑 ─────────────────────────────────────────────────────────────────

export async function listBizPayDemos(query: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  const user = currentUser();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const conds = [eq(bizPayDemos.createdBy, user.userId)];
  const tc = tenantCondition(bizPayDemos, user);
  if (tc) conds.push(tc);
  if (query.status) conds.push(eq(bizPayDemos.status, query.status as BizPayDemoStatus));
  if (query.keyword) conds.push(like(bizPayDemos.subject, `%${escapeLike(query.keyword)}%`));
  const where = and(...conds);
  const [total, rows] = await Promise.all([
    db.$count(bizPayDemos, where),
    db.select().from(bizPayDemos).where(where).orderBy(desc(bizPayDemos.id)).limit(pageSize).offset(pageOffset(page, pageSize)),
  ]);
  return { list: rows.map(mapBizPayDemo), total, page, pageSize };
}

export async function getBizPayDemo(id: number): Promise<BizPayDemo> {
  return mapBizPayDemo(await getOwnRow(id));
}

export async function createBizPayDemo(data: { subject: string; amount: number }): Promise<BizPayDemo> {
  const user = currentUser();
  const [row] = await db.insert(bizPayDemos).values({
    subject: data.subject,
    amount: data.amount,
    status: 'pending',
    tenantId: getCreateTenantId(user),
  }).returning();
  return mapBizPayDemo(row);
}

export async function deleteBizPayDemo(id: number): Promise<void> {
  const row = await getOwnRow(id);
  if (row.status === 'paid') throw new HTTPException(400, { message: '已支付的示例单不可删除' });
  await db.delete(bizPayDemos).where(eq(bizPayDemos.id, id));
}

/**
 * 发起支付：调用统一支付门面下单，回填支付单号并置 paying，返回支付参数。
 * 这一步是业务模块对接支付中心的核心：只需提供 bizType / bizId / 金额 / 支付方式。
 */
export async function payBizPayDemo(
  id: number,
  input: { payMethod: PaymentMethod; openId?: string },
  clientIp?: string,
): Promise<{ demo: BizPayDemo; payParams: CreatePaymentResult }> {
  const row = await getOwnRow(id);
  if (row.status === 'paid') throw new HTTPException(400, { message: '该示例单已支付，无需重复发起' });

  let orderNo: string;
  let payParams: CreatePaymentResult;
  try {
    const res = await createPayment({
      bizType: BIZ_PAY_DEMO_TYPE,
      bizId: String(row.id),
      subject: row.subject,
      amount: row.amount,
      payMethod: input.payMethod,
      openId: input.openId,
      expireMinutes: 30,
      clientIp,
    });
    orderNo = res.orderNo;
    payParams = res.payParams;
  } catch (err) {
    const msg = err instanceof HTTPException ? err.message : (err as Error)?.message ?? '未知错误';
    throw new HTTPException(400, {
      message: `发起支付失败（${msg}）。提示：未配置可用的默认支付渠道时，可直接点击「模拟支付成功」演示完整履约闭环。`,
    });
  }

  await db.update(bizPayDemos)
    .set({ status: 'paying', payMethod: input.payMethod, paymentOrderNo: orderNo })
    .where(eq(bizPayDemos.id, row.id));

  return { demo: mapBizPayDemo({ ...row, status: 'paying', payMethod: input.payMethod, paymentOrderNo: orderNo }), payParams };
}

/**
 * 模拟支付成功（演示专用）：同步派发一条 payment.succeeded 事件，驱动真实订阅器履约。
 * 真实环境的履约由支付回调 / 主动查单确认成功后经 Outbox 投递触发，逻辑完全一致。
 */
export async function simulateBizPayDemoPaid(id: number): Promise<BizPayDemo> {
  const user = currentUser();
  const row = await getOwnRow(id);
  if (row.status === 'paid') return mapBizPayDemo(row);
  const orderNo = row.paymentOrderNo ?? `PAYDEMO${Date.now()}${row.id}`;
  await paymentEventBus.dispatch({
    type: 'payment.succeeded',
    orderNo,
    outTradeNo: orderNo,
    bizType: BIZ_PAY_DEMO_TYPE,
    bizId: String(row.id),
    channel: 'wechat',
    amount: row.amount,
    userId: user.userId,
    tenantId: row.tenantId,
  });
  return getBizPayDemo(id);
}

/**
 * 履约（幂等）：支付成功后置 paid 并发放示例权益。
 * 由订阅器在请求上下文之外调用，故不依赖 currentUser；按主键 + 状态条件保证幂等，
 * 同一笔支付成功事件被重复投递（at-least-once）也只履约一次。
 */
export async function markBizPayDemoPaid(event: { bizId: string; orderNo: string; amount: number }): Promise<void> {
  const demoId = Number(event.bizId);
  if (!Number.isInteger(demoId) || demoId <= 0) {
    logger.warn('[biz-pay-demo] 履约 bizId 非法', { bizId: event.bizId });
    return;
  }
  const updated = await db.update(bizPayDemos)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentOrderNo: event.orderNo,
      fulfillRemark: '支付成功，已自动发放示例权益（演示履约）',
    })
    .where(and(eq(bizPayDemos.id, demoId), eq(bizPayDemos.status, 'paying')))
    .returning({ id: bizPayDemos.id });

  if (updated.length === 0) {
    // 兼容「模拟支付」直接从 pending 履约：再尝试非 paid 态更新一次
    const fallback = await db.update(bizPayDemos)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentOrderNo: event.orderNo,
        fulfillRemark: '支付成功，已自动发放示例权益（演示履约）',
      })
      .where(and(eq(bizPayDemos.id, demoId), eq(bizPayDemos.status, 'pending')))
      .returning({ id: bizPayDemos.id });
    if (fallback.length === 0) return; // 已履约或不存在，幂等跳过
  }
  logger.info('[biz-pay-demo] 履约完成', { demoId, orderNo: event.orderNo, amount: event.amount });
}
