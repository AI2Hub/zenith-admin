/**
 * 幂等控制中间件
 *
 * 提供两种工作模式（优先级：客户端 Token > 请求指纹）：
 *
 * **模式 1 — 客户端 Token（X-Idempotency-Key 头）**
 *   客户端在发起请求前自行生成唯一 key（通常是 UUID），放在请求头中。
 *   服务端首次处理后将结果缓存，TTL 内再次提交同一 key 直接拒绝（或将来可返回缓存结果）。
 *   适合：支付创单、工单提交等需要客户端显式保证的场景。
 *
 * **模式 2 — 服务端自动指纹（自动兜底）**
 *   服务端根据 actor + method + pathname + query + body-hash 计算 SHA-256 指纹。
 *   TTL 内若同一指纹再次到达，直接拒绝。
 *   适合：普通表单防重复提交，无需前端改造。
 *
 * 两种模式的 Redis key 都按**调用方身份（actor）**分命名空间：缓存的是完整响应体，
 * 不隔离就会把别人的响应回放给当前调用方。actor 的解析见 resolveActor()。
 *
 * 用法（在 createRoute 的 middleware 数组中声明）：
 *
 * ```ts
 * import { idempotencyGuard } from './idempotency';
 *
 * const route = createRoute({
 *   method: 'post',
 *   path: '/orders',
 *   middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 10 })] as const,
 *   ...
 * });
 * ```
 */

import crypto from 'node:crypto';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import redis from '../lib/redis';
import { config } from '../config';
import { errBody } from '../lib/openapi-schemas';
import { currentUserOrNull } from '../lib/context';
import { currentMemberOrNull } from '../lib/member-context';
import { getClientIp } from '../lib/request-helpers';
import logger from '../lib/logger';

/** idempotency Redis key 前缀，与其他 key 命名空间隔离 */
const IDEMPOTENCY_PREFIX = `${config.redis.keyPrefix}idempotency:`;

export interface IdempotencyOptions {
  /**
   * 幂等窗口时长（秒）。
   * - 模式 1（客户端 Token）：建议 30～300s，覆盖整个业务操作周期。
   * - 模式 2（自动指纹）：建议 5～15s，仅防止双击/网络重试。
   * @default 10
   */
  ttlSeconds?: number;

  /**
   * 被拦截时返回的错误提示。
   * @default '请勿重复提交'
   */
  message?: string;

  /**
   * 是否在没有 X-Idempotency-Key 时自动降级为指纹模式。
   * 设为 false 则仅在客户端提供 key 时才做幂等检查（接口无 key 则直接放行）。
   * @default true
   */
  autoFingerprint?: boolean;
}

interface CachedResponse {
  fingerprint: string;
  status: number;
  contentType: string | null;
  requestId: string | null;
  body: string;
}

const SETTLE_KEY = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
`;

/**
 * 计算请求体的 SHA-256 指纹（hex 截断为 16 字符）。
 * 对空/无 body 的请求返回固定字符串 'nobody'。
 */
async function hashBody(c: Context): Promise<string> {
  try {
    // Hono 保留已解析请求体；审计或校验提前读取后，raw.clone() 已经不可用。
    const text = await c.req.text();
    return crypto.createHash('sha256').update(text).digest('hex');
  } catch {
    throw new HTTPException(400, { message: '无法读取请求内容，请重新提交' });
  }
}

/**
 * 解析调用方身份（actor）—— 幂等缓存的隔离维度。
 *
 * 本系统有四类调用方，必须各自独立命名空间：命中缓存时会把此前的**完整响应体**
 * 原样回放，身份不隔离就等于把别人的响应返回给当前调用方，既丢自己的写入又泄露对方数据。
 *
 * 顺序有讲究：
 *  1. 开放应用 —— 网关请求没有管理员/会员 ALS 上下文，但已鉴权的 AppKey 就在 context 里
 *  2. 会员（前台 C 端）—— 走 memberAuthMiddleware，身份在 c.get('member')，
 *     **不在** c.get('user')。必须读取会员身份，避免签到、同额充值等接口跨会员回放响应
 *  3. 管理员 —— 编入 tenantId，防止多租户下同 userId 序列在不同租户间碰撞
 *  4. 匿名 —— 退化到来源 IP；连 IP 都没有时才用固定兜底
 *
 * 全部使用 *OrNull 变体：抛异常版本会让 2/3 两步无法区分「没有」和「出错」。
 */
function resolveActor(c: Context): string {
  const openAppKey = c.get('openApp')?.clientId as string | undefined;
  if (openAppKey) return `app:${openAppKey}`;

  const member = currentMemberOrNull();
  if (member) return `m:${member.memberId}`;

  const user = currentUserOrNull();
  if (user) return `u:${user.tenantId ?? 0}:${user.userId}`;

  const ip = getClientIp(c);
  return ip !== '127.0.0.1' ? `ip:${ip}` : 'anon';
}

/**
 * 幂等控制 Hono 中间件工厂函数。
 *
 * @example
 * // 防止 10 秒内重复提交（自动指纹模式）
 * middleware: [authMiddleware, idempotencyGuard()] as const
 *
 * @example
 * // 要求客户端携带 X-Idempotency-Key，不做自动指纹兜底
 * middleware: [authMiddleware, idempotencyGuard({ ttlSeconds: 60, autoFingerprint: false })] as const
 */
export function idempotencyGuard(options: IdempotencyOptions = {}) {
  const {
    ttlSeconds = 10,
    message = '请勿重复提交',
    autoFingerprint = true,
  } = options;

  return createMiddleware(async (c, next) => {
    const clientKey = c.req.header('x-idempotency-key');
    if (!clientKey && !autoFingerprint) return next();
    const url = new URL(c.req.url);
    const fingerprint = crypto.createHash('sha256')
      .update(`${c.req.method}|${url.pathname}${url.search}|${await hashBody(c)}`)
      .digest('hex');
    const idempotencyKey = crypto.createHash('sha256')
      .update(`${resolveActor(c)}|${clientKey ? clientKey.slice(0, 128) : fingerprint}`)
      .digest('hex').slice(0, 32);
    const redisKey = `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
    const processing = JSON.stringify({ state: 'processing', fingerprint, owner: crypto.randomUUID() });
    try {
      const existing = await redis.get(redisKey);
      if (existing) {
        let cached: Partial<CachedResponse>;
        try {
          cached = JSON.parse(existing) as Partial<CachedResponse>;
        } catch {
          return c.json(errBody(message, 429), 429);
        }
        if (cached.fingerprint !== fingerprint) {
          return c.json(errBody('同一幂等键不能提交不同内容', 409), 409);
        }
        if (typeof cached.body === 'string' && typeof cached.status === 'number') {
          const headers = new Headers({ 'X-Idempotency-Replayed': 'true' });
          if (cached.contentType) headers.set('Content-Type', cached.contentType);
          if (cached.requestId) headers.set('X-Request-Id', cached.requestId);
          return new Response(cached.body, { status: cached.status, headers });
        }
        return c.json(errBody(message, 429), 429);
      }
      if (await redis.set(redisKey, processing, 'EX', ttlSeconds, 'NX') === null) {
        return c.json(errBody(message, 429), 429);
      }
    } catch (err) {
      logger.error(`[Idempotency] Redis 检查失败，降级放行: ${(err as Error).message}`);
      return next();
    }

    // 仅 Redis 故障可以降级；业务异常不能再次执行 handler。
    try {
      await next();
    } finally {
      try {
        const res = c.res;
        const contentType = res.headers.get('Content-Type');
        const cached = res.status >= 200 && res.status < 300 && contentType?.includes('application/json')
          ? JSON.stringify({ fingerprint, status: res.status, contentType, requestId: res.headers.get('X-Request-Id'), body: await res.clone().text() } satisfies CachedResponse)
          : '';
        await redis.eval(SETTLE_KEY, 1, redisKey, processing, cached, String(ttlSeconds));
      } catch (err) {
        logger.error(`[Idempotency] Redis 结算失败: ${(err as Error).message}`);
      }
    }
  });
}
