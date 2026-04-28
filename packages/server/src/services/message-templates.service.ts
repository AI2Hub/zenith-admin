import { eq, and, ilike, or } from 'drizzle-orm';
import { escapeLike, withPagination } from '../lib/where-helpers';
import { db } from '../db';
import { messageTemplates } from '../db/schema';
import { HTTPException } from 'hono/http-exception';
import { rethrowPgUniqueViolation } from '../lib/db-errors';
import { formatDateTime } from '../lib/datetime';

export function mapMessageTemplate(row: typeof messageTemplates.$inferSelect) {
  return { ...row, createdAt: formatDateTime(row.createdAt), updatedAt: formatDateTime(row.updatedAt) };
}

export function interpolate(content: string, vars: Record<string, string>): string {
  return content.replaceAll(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return Object.hasOwn(vars, k) ? vars[k] : `{{${k}}}`;
  });
}

export interface ListMessageTemplatesQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  channel?: 'email' | 'sms' | 'in_app';
  status?: 'enabled' | 'disabled';
}

export async function listMessageTemplates(q: ListMessageTemplatesQuery) {
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 10)));
  const conditions = [];
  if (q.keyword) conditions.push(or(ilike(messageTemplates.name, `%${escapeLike(q.keyword)}%`), ilike(messageTemplates.code, `%${escapeLike(q.keyword)}%`)));
  if (q.channel) conditions.push(eq(messageTemplates.channel, q.channel));
  if (q.status) conditions.push(eq(messageTemplates.status, q.status));
  const where = and(...conditions);
  const [total, list] = await Promise.all([
    db.$count(messageTemplates, where),
    withPagination(db.select().from(messageTemplates).where(where).orderBy(messageTemplates.id).$dynamic(), page, pageSize),
  ]);
  return { list: list.map(mapMessageTemplate), total, page, pageSize };
}

export async function getMessageTemplate(id: number) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: '模板不存在' });
  return mapMessageTemplate(row);
}

export async function createMessageTemplate(data: typeof messageTemplates.$inferInsert) {
  try {
    const [row] = await db.insert(messageTemplates).values(data).returning();
    return mapMessageTemplate(row);
  } catch (err) {
    rethrowPgUniqueViolation(err, '模板编码已存在');
  }
}

export async function updateMessageTemplate(id: number, data: Partial<typeof messageTemplates.$inferInsert>) {
  try {
    const [row] = await db.update(messageTemplates).set({ ...data }).where(eq(messageTemplates.id, id)).returning();
    if (!row) throw new HTTPException(404, { message: '模板不存在' });
    return mapMessageTemplate(row);
  } catch (err) {
    rethrowPgUniqueViolation(err, '模板编码已存在');
  }
}

export async function deleteMessageTemplate(id: number) {
  const [row] = await db.delete(messageTemplates).where(eq(messageTemplates.id, id)).returning();
  if (!row) throw new HTTPException(404, { message: '模板不存在' });
}

export async function getMessageTemplateBeforeAudit(id: number) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1);
  if (!row) return null;
  return mapMessageTemplate(row);
}

export async function previewMessageTemplate(id: number, vars: Record<string, string>) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: '模板不存在' });
  const subject = row.subject ? interpolate(row.subject, vars) : null;
  const content = interpolate(row.content, vars);
  return { subject, content };
}
