import type { CacheOverview } from '@zenith/shared/platform';
import { getCacheCategoryLabel } from '@zenith/shared/platform';
import redis from '../../lib/redis';
import { config } from '../../config';
import { HTTPException } from 'hono/http-exception';
import { getRedisInfo } from './monitor.service';
import { scanKeys } from '../../lib/redis-scan';

export { scanKeys };

const { keyPrefix } = config.redis;

// key 首段（命名空间前缀后的第一个 `:` 分段）→ 分类名。
// 分类表在 shared 中集中维护，前后端共用；segment 与分类名必须一一对应：
// 前端「删除分类」按 segment 批量删除，同一分类名只能对应一个 segment。
export function getSegment(key: string): string {
  const stripped = key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key;
  return stripped.split(':')[0] ?? stripped;
}

export function getCategory(key: string): string {
  return getCacheCategoryLabel(getSegment(key));
}

/** 某分类下的全部 key：`{prefix}{segment}:*` + 精确键 `{prefix}{segment}`（如 perm-generation） */
async function scanCategoryKeys(segment: string): Promise<string[]> {
  const keys = await scanKeys(`${keyPrefix}${segment}:*`);
  const exactKey = `${keyPrefix}${segment}`;
  if (await redis.exists(exactKey)) keys.push(exactKey);
  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

export async function getKeyMeta(key: string) {
  const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);

  let value: string | null = null;
  let size = 0;

  try {
    if (type === 'string') {
      const raw = await redis.get(key);
      if (raw !== null) {
        size = Buffer.byteLength(raw, 'utf8');
        value = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
      }
    } else if (type === 'list') {
      size = await redis.llen(key);
    } else if (type === 'set') {
      size = await redis.scard(key);
    } else if (type === 'zset') {
      size = await redis.zcard(key);
    } else if (type === 'hash') {
      size = await redis.hlen(key);
    }
  } catch {
    // ignore
  }

  return {
    key,
    displayKey: key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key,
    segment: getSegment(key),
    category: getCategory(key),
    type,
    ttl,
    size,
    value,
  };
}

export async function getCacheList(keyword?: string) {
  let keys = await scanKeys(`${keyPrefix}*`);
  if (keyword) keys = keys.filter((k) => k.includes(keyword));
  keys.sort((a, b) => a.localeCompare(b));
  const items = await Promise.all(keys.map(getKeyMeta));
  return { list: items, total: items.length };
}

// string 直接返回原值；hash/list/set/zset 序列化为 JSON 字符串（编辑仍仅支持 string）
export async function getCacheFullValue(key: string): Promise<string | null> {
  const type = await redis.type(key);
  if (type === 'string') return redis.get(key);
  if (type === 'hash') return JSON.stringify(await redis.hgetall(key));
  if (type === 'list') return JSON.stringify(await redis.lrange(key, 0, -1));
  if (type === 'set') {
    const members = await redis.smembers(key);
    return JSON.stringify(members.sort((a, b) => a.localeCompare(b)));
  }
  if (type === 'zset') {
    const flat = await redis.zrange(key, '0', '-1', 'WITHSCORES');
    const entries: { member: string; score: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ member: flat[i], score: Number(flat[i + 1]) });
    }
    return JSON.stringify(entries);
  }
  return null;
}

function toAuditItem(meta: Awaited<ReturnType<typeof getKeyMeta>>) {
  return {
    key: meta.key,
    displayKey: meta.displayKey,
    segment: meta.segment,
    category: meta.category,
    type: meta.type,
    ttl: meta.ttl,
    size: meta.size,
  };
}

export async function getCacheBeforeAudit(key: string) {
  if (!key?.startsWith(keyPrefix)) return null;
  const exists = await redis.exists(key);
  if (!exists) return null;
  return toAuditItem(await getKeyMeta(key));
}

export async function getCachesByCategoryBeforeAudit(segment: string) {
  if (!segment) return { total: 0, list: [] };
  const keys = await scanCategoryKeys(segment);
  const items = await Promise.all(keys.map(getKeyMeta));
  return { total: items.length, list: items.map(toAuditItem) };
}

export async function getAllCachesBeforeAudit() {
  const keys = await scanKeys(`${keyPrefix}*`);
  keys.sort((a, b) => a.localeCompare(b));
  const items = await Promise.all(keys.map(getKeyMeta));
  return { total: items.length, list: items.map(toAuditItem) };
}

export async function deleteCacheKey(key: string) {
  if (!key) throw new HTTPException(400, { message: '参数错误：缺少 key' });
  if (!key.startsWith(keyPrefix)) throw new HTTPException(403, { message: '只能删除当前命名空间的缓存' });
  const deleted = await redis.del(key);
  if (deleted === 0) throw new HTTPException(404, { message: 'key 不存在' });
}

export async function deleteCacheByCategory(segment: string) {
  if (!segment) throw new HTTPException(400, { message: '参数错误：缺少 segment' });
  const keys = await scanCategoryKeys(segment);
  if (keys.length > 0) await redis.del(...keys);
  return keys.length;
}

export async function deleteAllCache() {
  const keys = await scanKeys(`${keyPrefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  return keys.length;
}

function assertNamespace(key: string): void {
  if (!key) throw new HTTPException(400, { message: '参数错误：缺少 key' });
  if (!key.startsWith(keyPrefix)) throw new HTTPException(403, { message: '只能操作当前命名空间的缓存' });
}

export async function getCacheOverview(): Promise<CacheOverview> {
  const info = await getRedisInfo();
  if (!info) {
    return {
      connected: false,
      version: '',
      uptimeSeconds: 0,
      connectedClients: 0,
      usedMemory: 0,
      usedMemoryHuman: '',
      maxMemory: 0,
      memFragmentationRatio: 0,
      keyspaceHits: 0,
      keyspaceMisses: 0,
      hitRate: 0,
      totalKeys: 0,
      keyPrefix,
    };
  }
  const totalLookups = info.keyspaceHits + info.keyspaceMisses;
  const hitRate = totalLookups > 0 ? Math.round((info.keyspaceHits / totalLookups) * 10000) / 100 : 0;
  return {
    connected: true,
    version: info.version,
    uptimeSeconds: info.uptimeSeconds,
    connectedClients: info.connectedClients,
    usedMemory: info.usedMemory,
    usedMemoryHuman: info.usedMemoryHuman,
    maxMemory: info.maxMemory,
    memFragmentationRatio: info.memFragmentationRatio,
    keyspaceHits: info.keyspaceHits,
    keyspaceMisses: info.keyspaceMisses,
    hitRate,
    totalKeys: info.keyCount,
    keyPrefix,
  };
}

export async function updateCacheTtl(key: string, ttl: number) {
  assertNamespace(key);
  const exists = await redis.exists(key);
  if (!exists) throw new HTTPException(404, { message: 'key 不存在' });
  if (ttl === -1) {
    await redis.persist(key);
  } else if (ttl > 0) {
    await redis.expire(key, ttl);
  } else {
    throw new HTTPException(400, { message: 'TTL 必须为 -1（永久）或大于 0 的秒数' });
  }
}

export async function updateCacheValue(key: string, value: string, ttl?: number) {
  assertNamespace(key);
  const type = await redis.type(key);
  if (type === 'none') throw new HTTPException(404, { message: 'key 不存在' });
  if (type !== 'string') throw new HTTPException(400, { message: '仅支持编辑字符串类型的缓存' });
  if (ttl === undefined) {
    // 保留原有过期时间
    await redis.call('SET', key, value, 'KEEPTTL');
  } else if (ttl === -1) {
    await redis.set(key, value);
  } else if (ttl > 0) {
    await redis.set(key, value, 'EX', ttl);
  } else {
    throw new HTTPException(400, { message: 'TTL 必须为 -1（永久）或大于 0 的秒数' });
  }
}

export async function deleteCacheKeys(keys: string[]) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new HTTPException(400, { message: '参数错误：缺少 keys' });
  }
  for (const key of keys) assertNamespace(key);
  const deleted = await redis.del(...keys);
  return deleted;
}

export async function getCacheKeysBeforeAudit(keys: string[]) {
  const valid = keys.filter((k) => k?.startsWith(keyPrefix));
  if (valid.length === 0) return { total: 0, list: [] };
  const existing: string[] = [];
  for (const key of valid) {
    if (await redis.exists(key)) existing.push(key);
  }
  if (existing.length === 0) return { total: 0, list: [] };
  const items = await Promise.all(existing.map(getKeyMeta));
  return { total: items.length, list: items.map(toAuditItem) };
}
