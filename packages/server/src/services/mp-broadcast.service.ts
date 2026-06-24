import { eq, and, desc, isNotNull, lte, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { mpBroadcasts, mpTags, mpAccounts } from '../db/schema';
import type { MpBroadcastRow } from '../db/schema';
import { mergeWhere, withPagination } from '../lib/where-helpers';
import { formatDateTime, formatNullableDateTime, parseDateTimeInput } from '../lib/datetime';
import { tenantScope, currentCreateTenantId } from '../lib/tenant';
import { ensureMpAccountExists } from './mp-account.service';
import { assertContentSafe } from './mp-security.service';
import { massSend, previewMassSend, getMassSendResult, WechatApiError } from '../lib/wechat';
import { mapWechatError } from '../lib/wechat-error';
import type { CreateMpBroadcastInput, UpdateMpBroadcastInput, MpBroadcastStatus } from '@zenith/shared';

export function mapMpBroadcast(row: MpBroadcastRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    msgType: row.msgType,
    target: row.target,
    tagId: row.tagId ?? null,
    content: row.content ?? null,
    mediaId: row.mediaId ?? null,
    status: row.status,
    wechatMsgId: row.wechatMsgId ?? null,
    scheduledAt: formatNullableDateTime(row.scheduledAt),
    errorMsg: row.errorMsg ?? null,
    sentAt: formatNullableDateTime(row.sentAt),
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export async function ensureMpBroadcastExists(id: number): Promise<MpBroadcastRow> {
  const [row] = await db.select().from(mpBroadcasts).where(and(eq(mpBroadcasts.id, id), tenantScope(mpBroadcasts))).limit(1);
  if (!row) throw new HTTPException(404, { message: '群发记录不存在' });
  return row;
}

export async function getMpBroadcastBeforeAudit(id: number) {
  return mapMpBroadcast(await ensureMpBroadcastExists(id));
}

export interface ListMpBroadcastsQuery {
  accountId: number;
  status?: MpBroadcastStatus;
  page: number;
  pageSize: number;
}

export async function listMpBroadcasts(q: ListMpBroadcastsQuery) {
  await ensureMpAccountExists(q.accountId);
  const conditions: SQL[] = [eq(mpBroadcasts.accountId, q.accountId)];
  const tenant = tenantScope(mpBroadcasts);
  if (tenant) conditions.push(tenant);
  if (q.status) conditions.push(eq(mpBroadcasts.status, q.status));
  const where = mergeWhere(and(...conditions));
  const [total, list] = await Promise.all([
    db.$count(mpBroadcasts, where),
    withPagination(db.select().from(mpBroadcasts).where(where).orderBy(desc(mpBroadcasts.id)).$dynamic(), q.page, q.pageSize),
  ]);
  return { list: list.map(mapMpBroadcast), total, page: q.page, pageSize: q.pageSize };
}

export async function createMpBroadcast(data: CreateMpBroadcastInput) {
  await ensureMpAccountExists(data.accountId);
  const tenantId = currentCreateTenantId();
  const [row] = await db.insert(mpBroadcasts).values({
    accountId: data.accountId,
    msgType: data.msgType,
    target: data.target,
    tagId: data.target === 'tag' ? (data.tagId ?? null) : null,
    content: data.msgType === 'text' ? (data.content ?? null) : null,
    mediaId: data.msgType === 'text' ? null : (data.mediaId ?? null),
    scheduledAt: parseDateTimeInput(data.scheduledAt),
    status: 'draft',
    tenantId,
  }).returning();
  return mapMpBroadcast(row);
}

export async function updateMpBroadcast(id: number, data: UpdateMpBroadcastInput) {
  const existing = await ensureMpBroadcastExists(id);
  if (existing.status === 'sent') throw new HTTPException(400, { message: '已发送的群发不可修改' });
  const { scheduledAt, ...rest } = data;
  const patch: Partial<typeof mpBroadcasts.$inferInsert> = { ...rest };
  // 规范化关联字段
  if (data.target === 'all') patch.tagId = null;
  if (data.msgType === 'text') patch.mediaId = null;
  else if (data.msgType === 'image' || data.msgType === 'mpnews') patch.content = null;
  if (scheduledAt !== undefined) patch.scheduledAt = parseDateTimeInput(scheduledAt);
  if (Object.keys(patch).length === 0) return mapMpBroadcast(existing);
  const [row] = await db.update(mpBroadcasts).set(patch).where(eq(mpBroadcasts.id, id)).returning();
  return mapMpBroadcast(row);
}

export async function deleteMpBroadcast(id: number) {
  await ensureMpBroadcastExists(id);
  await db.delete(mpBroadcasts).where(eq(mpBroadcasts.id, id));
}

/** 发送群发：解析标签 → 调微信 mass/sendall；成功回填 msg_id/sentAt，失败落 errorMsg 并抛错。 */
export async function sendMpBroadcast(id: number) {
  const broadcast = await ensureMpBroadcastExists(id);
  if (broadcast.status === 'sent') throw new HTTPException(400, { message: '该群发已发送' });
  const account = await ensureMpAccountExists(broadcast.accountId);

  let wechatTagId: number | null = null;
  if (broadcast.target === 'tag') {
    if (!broadcast.tagId) throw new HTTPException(400, { message: '请先指定群发标签' });
    const [tag] = await db.select({ wechatTagId: mpTags.wechatTagId }).from(mpTags)
      .where(and(eq(mpTags.id, broadcast.tagId), tenantScope(mpTags))).limit(1);
    if (!tag) throw new HTTPException(400, { message: '群发标签不存在' });
    if (tag.wechatTagId == null) throw new HTTPException(400, { message: '该标签尚未同步到微信，无法按标签群发' });
    wechatTagId = tag.wechatTagId;
  }

  try {
    await assertContentSafe(account, broadcast.content);
    const { msgId } = await massSend(account, {
      isToAll: broadcast.target === 'all',
      tagId: wechatTagId,
      msgType: broadcast.msgType,
      content: broadcast.content,
      mediaId: broadcast.mediaId,
    });
    const [row] = await db.update(mpBroadcasts)
      .set({ status: 'sent', wechatMsgId: msgId, errorMsg: null, sentAt: new Date() })
      .where(eq(mpBroadcasts.id, id)).returning();
    return mapMpBroadcast(row);
  } catch (err) {
    const message = err instanceof WechatApiError ? err.message : '调用微信接口失败，请检查网络或稍后重试';
    await db.update(mpBroadcasts).set({ status: 'failed', errorMsg: message }).where(eq(mpBroadcasts.id, id));
    mapWechatError(err);
  }
}

/** 群发预览：发送给指定 openid 预览（不改变群发状态） */
export async function previewMpBroadcast(id: number, openid: string) {
  const broadcast = await ensureMpBroadcastExists(id);
  const account = await ensureMpAccountExists(broadcast.accountId);
  try {
    await assertContentSafe(account, broadcast.content);
    await previewMassSend(account, { msgType: broadcast.msgType, content: broadcast.content, mediaId: broadcast.mediaId, openid });
  } catch (err) {
    mapWechatError(err);
  }
  return { success: true };
}

/** 查询群发发送结果与统计 */
export async function getMpBroadcastResult(id: number) {
  const broadcast = await ensureMpBroadcastExists(id);
  if (!broadcast.wechatMsgId) throw new HTTPException(400, { message: '该群发尚未发送，无发送结果' });
  const account = await ensureMpAccountExists(broadcast.accountId);
  try {
    return await getMassSendResult(account, broadcast.wechatMsgId);
  } catch (err) {
    return mapWechatError(err);
  }
}

/** 定时群发扫描：发送所有到期（scheduledAt<=now）且仍为草稿的群发。供 mp-broadcast-tick 调用（无登录上下文）。 */
export async function runDueMpBroadcasts(): Promise<{ sent: number; failed: number }> {
  const due = await db.select().from(mpBroadcasts)
    .where(and(eq(mpBroadcasts.status, 'draft'), isNotNull(mpBroadcasts.scheduledAt), lte(mpBroadcasts.scheduledAt, new Date())));
  let sent = 0;
  let failed = 0;
  for (const b of due) {
    try {
      const [account] = await db.select().from(mpAccounts).where(eq(mpAccounts.id, b.accountId)).limit(1);
      if (!account || account.status === 'disabled') continue;
      let wechatTagId: number | null = null;
      if (b.target === 'tag' && b.tagId) {
        const [tag] = await db.select({ wechatTagId: mpTags.wechatTagId }).from(mpTags).where(eq(mpTags.id, b.tagId)).limit(1);
        wechatTagId = tag?.wechatTagId ?? null;
      }
      await assertContentSafe(account, b.content);
      const { msgId } = await massSend(account, { isToAll: b.target === 'all', tagId: wechatTagId, msgType: b.msgType, content: b.content, mediaId: b.mediaId });
      await db.update(mpBroadcasts).set({ status: 'sent', wechatMsgId: msgId, errorMsg: null, sentAt: new Date() }).where(eq(mpBroadcasts.id, b.id));
      sent += 1;
    } catch (err) {
      await db.update(mpBroadcasts).set({ status: 'failed', errorMsg: (err as Error).message.slice(0, 500) }).where(eq(mpBroadcasts.id, b.id));
      failed += 1;
    }
  }
  return { sent, failed };
}
