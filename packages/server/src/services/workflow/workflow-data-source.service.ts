/**
 * 表单远程数据源 Service
 * CRUD + 代理拉取选项（仅登记 URL 可被调用，统一走 http-client，防 SSRF）。
 */
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db';
import { workflowDataSources } from '../../db/schema';
import { pageOffset } from '../../lib/pagination';
import { escapeLike } from '../../lib/where-helpers';
import { formatDateTime } from '../../lib/datetime';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { httpRequest } from '../../lib/http-client';
import type { WorkflowDataSourceRow } from '../../db/schema';
import type {
  WorkflowDataSource, WorkflowDataSourceOption,
  CreateWorkflowDataSourceInput, UpdateWorkflowDataSourceInput,
} from '@zenith/shared';

const OPTIONS_CACHE_TTL = 30_000;
const optionsCache = new Map<string, { data: WorkflowDataSourceOption[]; expire: number }>();

export function mapDataSource(row: WorkflowDataSourceRow): WorkflowDataSource {
  return {
    id: row.id,
    name: row.name,
    method: (row.method === 'POST' ? 'POST' : 'GET'),
    url: row.url,
    headers: row.headers ?? null,
    itemsPath: row.itemsPath ?? null,
    valueField: row.valueField,
    labelField: row.labelField,
    keywordParam: row.keywordParam ?? null,
    status: row.status,
    remark: row.remark ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

export async function ensureDataSourceExists(id: number): Promise<WorkflowDataSourceRow> {
  const [row] = await db.select().from(workflowDataSources).where(eq(workflowDataSources.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: '数据源不存在' });
  return row;
}

export async function getDataSource(id: number): Promise<WorkflowDataSource> {
  return mapDataSource(await ensureDataSourceExists(id));
}

export async function listDataSources(query: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  const { page = 1, pageSize = 20, keyword, status } = query;
  const conds = [];
  if (keyword) {
    const kw = `%${escapeLike(keyword)}%`;
    conds.push(or(ilike(workflowDataSources.name, kw), ilike(workflowDataSources.url, kw)));
  }
  if (status === 'enabled' || status === 'disabled') conds.push(eq(workflowDataSources.status, status));
  const where = conds.length ? and(...conds) : undefined;
  const [total, rows] = await Promise.all([
    db.$count(workflowDataSources, where),
    db.select().from(workflowDataSources).where(where).orderBy(desc(workflowDataSources.id)).limit(pageSize).offset(pageOffset(page, pageSize)),
  ]);
  return { list: rows.map(mapDataSource), total, page, pageSize };
}

export async function createDataSource(input: CreateWorkflowDataSourceInput): Promise<WorkflowDataSource> {
  try {
    const [row] = await db.insert(workflowDataSources).values({
      name: input.name,
      method: input.method ?? 'GET',
      url: input.url,
      headers: input.headers,
      itemsPath: input.itemsPath,
      valueField: input.valueField,
      labelField: input.labelField,
      keywordParam: input.keywordParam,
      status: input.status ?? 'enabled',
      remark: input.remark,
    }).returning();
    return mapDataSource(row);
  } catch (err) {
    rethrowPgUniqueViolation(err, '数据源名称已存在');
    throw err;
  }
}

export async function updateDataSource(id: number, input: UpdateWorkflowDataSourceInput): Promise<WorkflowDataSource> {
  try {
    const [row] = await db.update(workflowDataSources).set({
      name: input.name,
      method: input.method,
      url: input.url,
      headers: input.headers,
      itemsPath: input.itemsPath,
      valueField: input.valueField,
      labelField: input.labelField,
      keywordParam: input.keywordParam,
      status: input.status,
      remark: input.remark,
    }).where(eq(workflowDataSources.id, id)).returning();
    if (!row) throw new HTTPException(404, { message: '数据源不存在' });
    optionsCache.clear();
    return mapDataSource(row);
  } catch (err) {
    rethrowPgUniqueViolation(err, '数据源名称已存在');
    throw err;
  }
}

export async function deleteDataSource(id: number): Promise<void> {
  await db.delete(workflowDataSources).where(eq(workflowDataSources.id, id));
  optionsCache.clear();
}

function navigatePath(json: unknown, path?: string | null): unknown {
  if (!path) return json;
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key.trim()] : undefined),
    json,
  );
}

/** 代理拉取数据源选项（带 30s 缓存）。仅启用的登记数据源可被调用。 */
export async function fetchDataSourceOptions(id: number, keyword?: string): Promise<WorkflowDataSourceOption[]> {
  const cacheKey = `${id}:${keyword ?? ''}`;
  const cached = optionsCache.get(cacheKey);
  if (cached && cached.expire > Date.now()) return cached.data;

  const src = await ensureDataSourceExists(id);
  if (src.status !== 'enabled') throw new HTTPException(400, { message: '数据源已停用' });

  const method = src.method === 'POST' ? 'POST' : 'GET';
  let url = src.url;
  let body: Record<string, unknown> | undefined;
  if (keyword && src.keywordParam) {
    if (method === 'GET') {
      const u = new URL(src.url);
      u.searchParams.set(src.keywordParam, keyword);
      url = u.toString();
    } else {
      body = { [src.keywordParam]: keyword };
    }
  }

  let json: unknown;
  try {
    const res = await httpRequest(url, { method, headers: src.headers ?? undefined, body, timeout: 10_000 });
    if (!res.ok) throw new HTTPException(502, { message: `数据源返回状态 ${res.status}` });
    json = await res.json();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(502, { message: '数据源请求失败，请检查 URL 与网络' });
  }

  const arr = navigatePath(json, src.itemsPath);
  if (!Array.isArray(arr)) throw new HTTPException(502, { message: '数据源返回结构不是数组，请检查「数组路径」配置' });

  const options = arr
    .map((item) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      const value = rec[src.valueField];
      const labelRaw = rec[src.labelField] ?? value;
      return { value: value == null ? '' : String(value), label: labelRaw == null ? '' : String(labelRaw) };
    })
    .filter((o) => o.value !== '');

  optionsCache.set(cacheKey, { data: options, expire: Date.now() + OPTIONS_CACHE_TTL });
  return options;
}
