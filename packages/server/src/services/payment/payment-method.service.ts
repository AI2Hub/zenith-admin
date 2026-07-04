/**
 * 支付方式管理 Service。
 * 维护可用支付方式（启停/排序/名称/图标），下单时校验方式是否启用（无配置=放行，向后兼容）。
 * 支付方式配置全局唯一（method 唯一约束），不区分租户。
 */
import { asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../db';
import { paymentMethodConfigs, type PaymentMethodConfigRow } from '../../db/schema';
import { formatDateTime } from '../../lib/datetime';
import type { UpdatePaymentMethodConfigInput } from '@zenith/shared';
import type { PaymentMethod, PaymentMethodConfig } from '@zenith/shared';

export function mapMethodConfig(row: PaymentMethodConfigRow): PaymentMethodConfig {
  return {
    id: row.id,
    method: row.method,
    channel: row.channel,
    label: row.label,
    icon: row.icon ?? null,
    enabled: row.enabled,
    sort: row.sort,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export async function listMethodConfigs(): Promise<PaymentMethodConfig[]> {
  const rows = await db.select().from(paymentMethodConfigs).orderBy(asc(paymentMethodConfigs.sort), asc(paymentMethodConfigs.id));
  return rows.map(mapMethodConfig);
}

export async function listEnabledMethodConfigs(): Promise<PaymentMethodConfig[]> {
  const rows = await db
    .select()
    .from(paymentMethodConfigs)
    .where(eq(paymentMethodConfigs.enabled, true))
    .orderBy(asc(paymentMethodConfigs.sort), asc(paymentMethodConfigs.id));
  return rows.map(mapMethodConfig);
}

async function ensureMethodConfig(id: number): Promise<PaymentMethodConfigRow> {
  const [row] = await db.select().from(paymentMethodConfigs).where(eq(paymentMethodConfigs.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: '支付方式配置不存在' });
  return row;
}

export async function getMethodConfig(id: number): Promise<PaymentMethodConfig> {
  return mapMethodConfig(await ensureMethodConfig(id));
}

export async function updateMethodConfig(id: number, input: UpdatePaymentMethodConfigInput): Promise<PaymentMethodConfig> {
  await ensureMethodConfig(id);
  const set: Partial<PaymentMethodConfigRow> = {};
  if (input.label !== undefined) set.label = input.label;
  if (input.icon !== undefined) set.icon = input.icon || null;
  if (input.enabled !== undefined) set.enabled = input.enabled;
  if (input.sort !== undefined) set.sort = input.sort;
  const [row] = await db.update(paymentMethodConfigs).set(set).where(eq(paymentMethodConfigs.id, id)).returning();
  return mapMethodConfig(row);
}

/** 下单校验：方式被显式停用则拦截；未配置该方式则放行（向后兼容）。 */
export async function assertMethodEnabled(method: PaymentMethod): Promise<void> {
  const [row] = await db.select({ enabled: paymentMethodConfigs.enabled, label: paymentMethodConfigs.label }).from(paymentMethodConfigs).where(eq(paymentMethodConfigs.method, method)).limit(1);
  if (row && !row.enabled) {
    throw new HTTPException(400, { message: `支付方式「${row.label}」已停用` });
  }
}
