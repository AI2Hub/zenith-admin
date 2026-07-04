import { eq, and, ilike, desc, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../db';
import { mpDrafts } from '../../db/schema';
import type { MpDraftRow } from '../../db/schema';
import { mergeWhere, escapeLike, withPagination } from '../../lib/where-helpers';
import { formatDateTime } from '../../lib/datetime';
import { tenantScope, currentCreateTenantId } from '../../lib/tenant';
import { ensureMpAccountExists } from './mp-account.service';
import { addWechatDraft } from '../../lib/wechat';
import { mapWechatError } from '../../lib/wechat-error';
import type { CreateMpDraftInput, UpdateMpDraftInput, MpArticle } from '@zenith/shared';

export function mapMpDraft(row: MpDraftRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    articles: (row.articles ?? []) as MpArticle[],
    wechatMediaId: row.wechatMediaId ?? null,
    status: row.status,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export async function ensureMpDraftExists(id: number): Promise<MpDraftRow> {
  const [row] = await db.select().from(mpDrafts).where(and(eq(mpDrafts.id, id), tenantScope(mpDrafts))).limit(1);
  if (!row) throw new HTTPException(404, { message: '图文草稿不存在' });
  return row;
}

export async function getMpDraft(id: number) {
  return mapMpDraft(await ensureMpDraftExists(id));
}

export interface ListMpDraftsQuery {
  accountId: number;
  keyword?: string;
  page: number;
  pageSize: number;
}

export async function listMpDrafts(q: ListMpDraftsQuery) {
  await ensureMpAccountExists(q.accountId);
  const conditions: SQL[] = [eq(mpDrafts.accountId, q.accountId)];
  const tenant = tenantScope(mpDrafts);
  if (tenant) conditions.push(tenant);
  if (q.keyword) conditions.push(ilike(mpDrafts.title, `%${escapeLike(q.keyword)}%`));
  const where = mergeWhere(and(...conditions));
  const [total, list] = await Promise.all([
    db.$count(mpDrafts, where),
    withPagination(db.select().from(mpDrafts).where(where).orderBy(desc(mpDrafts.id)).$dynamic(), q.page, q.pageSize),
  ]);
  return { list: list.map(mapMpDraft), total, page: q.page, pageSize: q.pageSize };
}

export async function createMpDraft(data: CreateMpDraftInput) {
  await ensureMpAccountExists(data.accountId);
  const tenantId = currentCreateTenantId();
  const title = data.articles[0]?.title ?? '未命名图文';
  const [row] = await db.insert(mpDrafts).values({ accountId: data.accountId, title, articles: data.articles, tenantId }).returning();
  return mapMpDraft(row);
}

export async function updateMpDraft(id: number, data: UpdateMpDraftInput) {
  await ensureMpDraftExists(id);
  const title = data.articles[0]?.title ?? '未命名图文';
  const [row] = await db.update(mpDrafts).set({ title, articles: data.articles, status: 'draft', wechatMediaId: null }).where(eq(mpDrafts.id, id)).returning();
  return mapMpDraft(row);
}

export async function deleteMpDraft(id: number) {
  await ensureMpDraftExists(id);
  await db.delete(mpDrafts).where(eq(mpDrafts.id, id));
}

/** 推送图文草稿到微信草稿箱 */
export async function pushMpDraft(id: number) {
  const row = await ensureMpDraftExists(id);
  const account = await ensureMpAccountExists(row.accountId);
  const articles = (row.articles ?? []) as MpArticle[];
  if (articles.length === 0) throw new HTTPException(400, { message: '草稿内容为空' });
  let mediaId: string;
  try {
    mediaId = await addWechatDraft(account, articles);
  } catch (err) {
    return mapWechatError(err);
  }
  const [updated] = await db.update(mpDrafts).set({ wechatMediaId: mediaId, status: 'published' }).where(eq(mpDrafts.id, id)).returning();
  return mapMpDraft(updated);
}
