import { eq, and, ilike, desc, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { mpMessageTemplates, mpTemplateSendLogs } from '../db/schema';
import type { MpMessageTemplateRow, MpTemplateSendLogRow } from '../db/schema';
import { mergeWhere, escapeLike, withPagination } from '../lib/where-helpers';
import { formatDateTime } from '../lib/datetime';
import { tenantScope, currentCreateTenantId } from '../lib/tenant';
import { ensureMpAccountExists } from './mp-account.service';
import { getAllPrivateTemplates, sendTemplateMessage, WechatApiError } from '../lib/wechat';
import { mapWechatError } from '../lib/wechat-error';
import type { SendMpTemplateInput, MpTemplateSendStatus } from '@zenith/shared';

export function mapMpTemplate(row: MpMessageTemplateRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    templateId: row.templateId,
    title: row.title,
    content: row.content ?? null,
    example: row.example ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export function mapMpTemplateSendLog(row: MpTemplateSendLogRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    templateId: row.templateId,
    openid: row.openid,
    data: (row.data ?? null) as Record<string, unknown> | null,
    url: row.url ?? null,
    status: row.status,
    errorMsg: row.errorMsg ?? null,
    msgId: row.msgId ?? null,
    createdAt: formatDateTime(row.createdAt),
  };
}

export async function ensureMpTemplateExists(id: number): Promise<MpMessageTemplateRow> {
  const [row] = await db.select().from(mpMessageTemplates).where(and(eq(mpMessageTemplates.id, id), tenantScope(mpMessageTemplates))).limit(1);
  if (!row) throw new HTTPException(404, { message: '模板不存在' });
  return row;
}

export interface ListMpTemplatesQuery { accountId: number; keyword?: string; page: number; pageSize: number; }

export async function listMpTemplates(q: ListMpTemplatesQuery) {
  await ensureMpAccountExists(q.accountId);
  const conditions: SQL[] = [eq(mpMessageTemplates.accountId, q.accountId)];
  const tenant = tenantScope(mpMessageTemplates);
  if (tenant) conditions.push(tenant);
  if (q.keyword) conditions.push(ilike(mpMessageTemplates.title, `%${escapeLike(q.keyword)}%`));
  const where = mergeWhere(and(...conditions));
  const [total, list] = await Promise.all([
    db.$count(mpMessageTemplates, where),
    withPagination(db.select().from(mpMessageTemplates).where(where).orderBy(mpMessageTemplates.id).$dynamic(), q.page, q.pageSize),
  ]);
  return { list: list.map(mapMpTemplate), total, page: q.page, pageSize: q.pageSize };
}

export async function deleteMpTemplate(id: number) {
  await ensureMpTemplateExists(id);
  await db.delete(mpMessageTemplates).where(eq(mpMessageTemplates.id, id));
}

/** 从微信同步模板库 */
export async function syncMpTemplates(accountId: number): Promise<{ success: boolean; created: number; updated: number; total: number }> {
  const account = await ensureMpAccountExists(accountId);
  const tenantId = currentCreateTenantId();
  let templates;
  try {
    templates = await getAllPrivateTemplates(account);
  } catch (err) {
    return mapWechatError(err);
  }
  let created = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const t of templates) {
      const [existing] = await tx.select({ id: mpMessageTemplates.id }).from(mpMessageTemplates)
        .where(and(eq(mpMessageTemplates.accountId, accountId), eq(mpMessageTemplates.templateId, t.template_id))).limit(1);
      if (existing) {
        await tx.update(mpMessageTemplates).set({ title: t.title, content: t.content, example: t.example }).where(eq(mpMessageTemplates.id, existing.id));
        updated += 1;
      } else {
        await tx.insert(mpMessageTemplates).values({ accountId, templateId: t.template_id, title: t.title, content: t.content, example: t.example, tenantId });
        created += 1;
      }
    }
  });
  return { success: true, created, updated, total: templates.length };
}

/** 发送模板消息，记录发送日志（成功/失败均落库） */
export async function sendMpTemplate(input: SendMpTemplateInput) {
  const account = await ensureMpAccountExists(input.accountId);
  const tenantId = currentCreateTenantId();
  try {
    const msgId = await sendTemplateMessage(account, { openid: input.openid, templateId: input.templateId, url: input.url, data: input.data });
    const [log] = await db.insert(mpTemplateSendLogs).values({
      accountId: input.accountId, templateId: input.templateId, openid: input.openid,
      data: input.data, url: input.url ?? null, status: 'success', msgId, tenantId,
    }).returning();
    return mapMpTemplateSendLog(log);
  } catch (err) {
    const message = err instanceof WechatApiError ? err.message : '调用微信接口失败，请检查网络或稍后重试';
    await db.insert(mpTemplateSendLogs).values({
      accountId: input.accountId, templateId: input.templateId, openid: input.openid,
      data: input.data, url: input.url ?? null, status: 'failed', errorMsg: message, tenantId,
    });
    mapWechatError(err);
  }
}

export interface ListMpSendLogsQuery { accountId: number; status?: MpTemplateSendStatus; page: number; pageSize: number; }

export async function listMpTemplateSendLogs(q: ListMpSendLogsQuery) {
  await ensureMpAccountExists(q.accountId);
  const conditions: SQL[] = [eq(mpTemplateSendLogs.accountId, q.accountId)];
  const tenant = tenantScope(mpTemplateSendLogs);
  if (tenant) conditions.push(tenant);
  if (q.status) conditions.push(eq(mpTemplateSendLogs.status, q.status));
  const where = mergeWhere(and(...conditions));
  const [total, list] = await Promise.all([
    db.$count(mpTemplateSendLogs, where),
    withPagination(db.select().from(mpTemplateSendLogs).where(where).orderBy(desc(mpTemplateSendLogs.id)).$dynamic(), q.page, q.pageSize),
  ]);
  return { list: list.map(mapMpTemplateSendLog), total, page: q.page, pageSize: q.pageSize };
}
