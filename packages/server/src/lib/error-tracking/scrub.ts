import type { Context } from 'hono';
import { redactBody } from '../sanitize';
import type { RequestSnapshot } from './types';

/** 只保留对定位有用的请求头；凭证类（authorization / cookie / x-api-key…）根本不进快照 */
const HEADER_ALLOWLIST = new Set([
  'content-type', 'content-length', 'accept', 'accept-language', 'user-agent', 'referer', 'origin', 'host',
  'x-request-id', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'idempotency-key', 'x-tenant-code',
]);

const HEADER_VALUE_MAX = 512;

export function pickHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries: Iterable<[string, string]> = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [name, value] of entries) {
    const key = name.toLowerCase();
    if (!HEADER_ALLOWLIST.has(key)) continue;
    out[key] = value.slice(0, HEADER_VALUE_MAX);
  }
  return out;
}

/** 在内置敏感字段之外按运行时设置追加字段名（包含匹配、大小写不敏感） */
export function redactExtraKeys(value: unknown, extraKeys: readonly string[]): unknown {
  if (extraKeys.length === 0 || value === null || typeof value !== 'object') return value;
  const needles = extraKeys.map((k) => k.toLowerCase()).filter(Boolean);
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node as Record<string, unknown>)) {
      const record = node as Record<string, unknown>;
      if (needles.some((n) => key.toLowerCase().includes(n))) record[key] = '***';
      else walk(record[key]);
    }
  };
  walk(value);
  return value;
}

/** 脱敏 + 按字节截断：超长时退化为字符串并标注截断量，保证 jsonb 体积有上界 */
export function scrubBody(body: unknown, options: { maxBytes: number; extraKeys: readonly string[] }): unknown {
  if (body === undefined || body === null) return undefined;
  if (options.maxBytes <= 0) return undefined;
  const redacted = redactExtraKeys(redactBody(body), options.extraKeys);
  let text: string;
  try {
    text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted) ?? '';
  } catch {
    return '[unserializable]';
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= options.maxBytes) return redacted;
  return `${Buffer.from(text, 'utf8').subarray(0, options.maxBytes).toString('utf8')}…(truncated ${bytes - options.maxBytes} bytes)`;
}

/** hono 校验器 / handler 已读过的请求体缓存（`bodyCache` 里存的是各读取方法的 Promise），避免二次读流；未读过则在流未消费时按文本读取 */
async function readRequestBody(c: Context, maxBytes: number): Promise<unknown> {
  const type = c.req.header('content-type') ?? '';
  const parseText = (text: string): unknown => {
    const cut = text.slice(0, Math.max(maxBytes * 2, 1024));
    if (!type.includes('json')) return cut;
    try { return JSON.parse(cut); } catch { return cut; }
  };
  const cache = (c.req as unknown as { bodyCache?: Record<string, unknown> }).bodyCache;
  if (cache) {
    if (cache.json !== undefined) return await (cache.json as Promise<unknown> | unknown);
    if (cache.text !== undefined) return parseText(String(await (cache.text as Promise<string> | string)));
    if (cache.formData !== undefined) {
      const form = await (cache.formData as Promise<FormData> | FormData);
      return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `[file ${v.name}]`]));
    }
  }
  if (c.req.raw.bodyUsed) return undefined;
  if (!/json|x-www-form-urlencoded|text\//.test(type)) return undefined;
  return parseText(await c.req.raw.clone().text());
}

function redactRecord(record: Record<string, string> | null, extraKeys: readonly string[]): Record<string, string> | null {
  if (!record) return null;
  return redactExtraKeys(redactBody(record), extraKeys) as Record<string, string>;
}

/**
 * 从 hono 上下文构建请求快照：方法 / URL / 路由模板 / 白名单请求头 / query / params / 脱敏截断后的请求体。
 * 任何一步失败都不影响主流程（返回已收集的部分）。
 */
export async function snapshotRequest(
  c: Context,
  options: { status?: number; captureBody: boolean; bodyMaxBytes: number; extraKeys: readonly string[] },
): Promise<RequestSnapshot> {
  const method = c.req.method;
  const url = c.req.url.slice(0, 1024);
  const base: RequestSnapshot = {
    method,
    url,
    route: c.req.routePath || null,
    status: options.status ?? null,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null,
    headers: pickHeaders(c.req.raw.headers),
    query: redactRecord(c.req.query(), options.extraKeys),
    params: redactRecord((() => { try { return c.req.param(); } catch { return null; } })(), options.extraKeys),
  };
  if (!options.captureBody || method === 'GET' || method === 'HEAD') return base;
  try {
    const body = await readRequestBody(c, options.bodyMaxBytes);
    return { ...base, body: scrubBody(body, { maxBytes: options.bodyMaxBytes, extraKeys: options.extraKeys }) };
  } catch {
    return base;
  }
}
