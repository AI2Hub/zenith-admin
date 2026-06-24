import { eq, and, ilike, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { mpAutoReplies } from '../db/schema';
import type { MpAutoReplyRow } from '../db/schema';
import { mergeWhere, escapeLike, withPagination } from '../lib/where-helpers';
import { formatDateTime } from '../lib/datetime';
import { tenantScope, currentCreateTenantId } from '../lib/tenant';
import { ensureMpAccountExists } from './mp-account.service';
import type { CreateMpAutoReplyInput, UpdateMpAutoReplyInput, MpAutoReplyType, MpReplyContentType, MpReplyArticle } from '@zenith/shared';

export function mapMpAutoReply(row: MpAutoReplyRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    replyType: row.replyType,
    keyword: row.keyword ?? null,
    matchType: row.matchType,
    contentType: row.contentType,
    content: row.content ?? null,
    mediaId: row.mediaId ?? null,
    newsArticles: row.newsArticles ?? null,
    status: row.status,
    sort: row.sort,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export async function ensureMpAutoReplyExists(id: number): Promise<MpAutoReplyRow> {
  const [row] = await db.select().from(mpAutoReplies).where(and(eq(mpAutoReplies.id, id), tenantScope(mpAutoReplies))).limit(1);
  if (!row) throw new HTTPException(404, { message: '自动回复不存在' });
  return row;
}

export async function getMpAutoReplyBeforeAudit(id: number) {
  return mapMpAutoReply(await ensureMpAutoReplyExists(id));
}

export interface ListMpAutoRepliesQuery {
  accountId: number;
  replyType?: MpAutoReplyType;
  keyword?: string;
  page: number;
  pageSize: number;
}

export async function listMpAutoReplies(q: ListMpAutoRepliesQuery) {
  await ensureMpAccountExists(q.accountId);
  const conditions: SQL[] = [eq(mpAutoReplies.accountId, q.accountId)];
  const tenant = tenantScope(mpAutoReplies);
  if (tenant) conditions.push(tenant);
  if (q.replyType) conditions.push(eq(mpAutoReplies.replyType, q.replyType));
  if (q.keyword) conditions.push(ilike(mpAutoReplies.keyword, `%${escapeLike(q.keyword)}%`));
  const where = mergeWhere(and(...conditions));
  const [total, list] = await Promise.all([
    db.$count(mpAutoReplies, where),
    withPagination(db.select().from(mpAutoReplies).where(where).orderBy(mpAutoReplies.replyType, mpAutoReplies.sort, mpAutoReplies.id).$dynamic(), q.page, q.pageSize),
  ]);
  return { list: list.map(mapMpAutoReply), total, page: q.page, pageSize: q.pageSize };
}

export async function createMpAutoReply(data: CreateMpAutoReplyInput) {
  await ensureMpAccountExists(data.accountId);
  // 关注回复 / 默认回复 每账号仅允许一条
  if (data.replyType === 'subscribe' || data.replyType === 'default') {
    const [existing] = await db.select({ id: mpAutoReplies.id }).from(mpAutoReplies)
      .where(and(eq(mpAutoReplies.accountId, data.accountId), eq(mpAutoReplies.replyType, data.replyType), tenantScope(mpAutoReplies)))
      .limit(1);
    if (existing) {
      throw new HTTPException(400, { message: data.replyType === 'subscribe' ? '已存在关注回复，请直接编辑' : '已存在默认回复，请直接编辑' });
    }
  }
  const tenantId = currentCreateTenantId();
  const [row] = await db.insert(mpAutoReplies).values({ ...data, tenantId }).returning();
  return mapMpAutoReply(row);
}

export async function updateMpAutoReply(id: number, data: UpdateMpAutoReplyInput) {
  const existing = await ensureMpAutoReplyExists(id);
  // 空补丁直接返回，避免 Drizzle "No values to set"
  if (Object.keys(data).length === 0) return mapMpAutoReply(existing);
  const [row] = await db.update(mpAutoReplies).set(data).where(eq(mpAutoReplies.id, id)).returning();
  return mapMpAutoReply(row);
}

export async function deleteMpAutoReply(id: number) {
  await ensureMpAutoReplyExists(id);
  await db.delete(mpAutoReplies).where(eq(mpAutoReplies.id, id));
}

/** 回调匹配到的回复（含富媒体字段） */
export interface ResolvedReply {
  contentType: MpReplyContentType;
  content: string | null;
  mediaId: string | null;
  newsArticles: MpReplyArticle[] | null;
}

function toResolved(row: MpAutoReplyRow): ResolvedReply {
  return { contentType: row.contentType, content: row.content ?? null, mediaId: row.mediaId ?? null, newsArticles: row.newsArticles ?? null };
}

/**
 * 回调匹配自动回复（无登录上下文，按 accountId 过滤）。
 * - 关注事件 → 关注回复
 * - 文本消息 → 关键词回复（按 sort，exact/contain），未命中则默认回复
 * 返回结构化回复（含富媒体），无匹配返回 null。
 */
export async function resolveAutoReply(accountId: number, input: { event?: string; text?: string }): Promise<ResolvedReply | null> {
  if (input.event === 'subscribe') {
    const [r] = await db.select().from(mpAutoReplies)
      .where(and(eq(mpAutoReplies.accountId, accountId), eq(mpAutoReplies.replyType, 'subscribe'), eq(mpAutoReplies.status, 'enabled')))
      .limit(1);
    return r ? toResolved(r) : null;
  }
  if (input.text != null) {
    const keywordReplies = await db.select().from(mpAutoReplies)
      .where(and(eq(mpAutoReplies.accountId, accountId), eq(mpAutoReplies.replyType, 'keyword'), eq(mpAutoReplies.status, 'enabled')))
      .orderBy(mpAutoReplies.sort, mpAutoReplies.id);
    for (const r of keywordReplies) {
      if (!r.keyword) continue;
      const matched = r.matchType === 'exact' ? input.text === r.keyword : input.text.includes(r.keyword);
      if (matched) return toResolved(r);
    }
    const [def] = await db.select().from(mpAutoReplies)
      .where(and(eq(mpAutoReplies.accountId, accountId), eq(mpAutoReplies.replyType, 'default'), eq(mpAutoReplies.status, 'enabled')))
      .limit(1);
    return def ? toResolved(def) : null;
  }
  return null;
}
