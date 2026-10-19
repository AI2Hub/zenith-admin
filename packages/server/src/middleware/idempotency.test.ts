/**
 * 幂等控制中间件单测（防重复提交，支付/创单安全关键）。
 *
 * 覆盖要点：
 *  1. 客户端 Token 模式（X-Idempotency-Key）：首次放行 + SET NX、重复提交 429、
 *     成功 JSON 响应缓存 + 网络重试返回缓存响应、不同调用方之间的 key 隔离
 *  2. 自动指纹模式：同用户同请求体 429、查询串参与指纹、key 长度截断（128）
 *  3. autoFingerprint=false 且无 header → 直接放行（不触 Redis）
 *  4. 并发竞争：GET 未命中但 SET NX 失败 → 429
 *  5. Redis 故障降级放行（不阻断业务）
 *  6. 非 2xx 响应不缓存
 *
 * Mock 策略：redis / config / context / logger 全部 mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../config', () => ({
  // 测试经 app.request() 发起，无 TCP 连接信息 → 远端地址回退 127.0.0.1；
  // 将其列入可信代理后 x-forwarded-for 才会被采信（与真实反代部署一致）
  config: { redis: { keyPrefix: 'test:' }, trustedProxyCidrs: ['127.0.0.1/32'] },
}));

vi.mock('../lib/redis', () => ({
  default: { get: vi.fn(), set: vi.fn(), eval: vi.fn() },
}));

vi.mock('../lib/context', () => ({
  currentUserOrNull: vi.fn().mockReturnValue({ userId: 1, username: 'alice', tenantId: null }),
}));

vi.mock('../lib/member-context', () => ({
  currentMemberOrNull: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../lib/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import redis from '../lib/redis';
import { currentUserOrNull } from '../lib/context';
import { currentMemberOrNull } from '../lib/member-context';
import { idempotencyGuard, type IdempotencyOptions } from './idempotency';

const redisMock = vi.mocked(redis);

/** 以指定管理员身份发起请求（tenantId 参与身份，多租户下防跨租户碰撞） */
function asAdmin(userId: number, tenantId: number | null = null) {
  vi.mocked(currentUserOrNull).mockReturnValue({ userId, username: `u${userId}`, tenantId } as ReturnType<typeof currentUserOrNull>);
  vi.mocked(currentMemberOrNull).mockReturnValue(undefined);
}

/** 以指定会员身份发起请求（会员走 c.get('member')，管理员上下文为空） */
function asMember(memberId: number) {
  vi.mocked(currentUserOrNull).mockReturnValue(undefined);
  vi.mocked(currentMemberOrNull).mockReturnValue({ memberId } as ReturnType<typeof currentMemberOrNull>);
}

/** 匿名访问（既非管理员也非会员） */
function asAnonymous() {
  vi.mocked(currentUserOrNull).mockReturnValue(undefined);
  vi.mocked(currentMemberOrNull).mockReturnValue(undefined);
}

/** 取本次请求写入的 Redis 占位 key（第一次 set 即 processing 占位） */
function placeholderKey(callIndex = 0): string {
  return redisMock.set.mock.calls[callIndex][0] as string;
}

function buildApp(opts: IdempotencyOptions = {}, status = 200, openAppKey?: string, consumeBody = false) {
  const app = new Hono();
  const handler = vi.fn();
  app.post('/orders', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (openAppKey) c.set('openApp', { clientId: openAppKey } as any);
    if (consumeBody) await c.req.json();
    await next();
  }, idempotencyGuard(opts), (c) => {
    handler();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json({ code: 0, message: 'success', data: { orderNo: 'PO-1' } }, status as any);
  });
  return { app, handler };
}

/** 幂等 key 一律是身份 + 请求特征的哈希，不再把客户端原文写进 Redis key */
const HASHED_KEY = /^test:idempotency:[0-9a-f]{32}$/;

function post(app: Hono, headers: Record<string, string> = {}, body = '{"amount":100}') {
  return app.request('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  asAdmin(1);
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
  redisMock.eval.mockResolvedValue('OK');
});

describe('idempotencyGuard - 客户端 Token 模式', () => {
  it('首次请求放行并以 header key 做 SET NX', async () => {
    const { app, handler } = buildApp({ ttlSeconds: 60 });
    const res = await post(app, { 'X-Idempotency-Key': 'client-key-123' });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // 第一次 set：processing 占位（SET NX EX）
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(HASHED_KEY),
      expect.stringContaining('processing'),
      'EX',
      60,
      'NX',
    );
  });

  it('处理中重复提交（GET 命中 processing 占位）→ 429 不执行 handler', async () => {
    const { app, handler } = buildApp({ message: '订单处理中，请勿重复提交' });
    await post(app, { 'X-Idempotency-Key': 'client-key-123' });
    redisMock.get.mockResolvedValue(redisMock.set.mock.calls[0][1] as string);
    handler.mockClear();
    const res = await post(app, { 'X-Idempotency-Key': 'client-key-123' });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toEqual({ code: 429, message: '订单处理中，请勿重复提交', data: null });
    expect(handler).not.toHaveBeenCalled();
  });

  it('成功响应仅由持有者原子写入缓存', async () => {
    const { app } = buildApp({ ttlSeconds: 30 });
    await post(app, { 'X-Idempotency-Key': 'k1' });

    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const [, , key, owner, value, ttl] = redisMock.eval.mock.calls[0];
    expect(key).toMatch(HASHED_KEY);
    expect(key).toBe(redisMock.set.mock.calls[0][0]);
    expect(owner).toBe(redisMock.set.mock.calls[0][1]);
    expect(ttl).toBe('30');
    const cached = JSON.parse(value as string);
    expect(cached.status).toBe(200);
    expect(cached.fingerprint).toHaveLength(64);
    expect(cached.body).toContain('PO-1');
  });

  it('网络重试命中已缓存响应 → 直接返回缓存 body/status，不执行 handler', async () => {
    const { app, handler } = buildApp();
    await post(app, { 'X-Idempotency-Key': 'k1' });
    redisMock.get.mockResolvedValue(redisMock.eval.mock.calls[0][4] as string);
    handler.mockClear();
    const res = await post(app, { 'X-Idempotency-Key': 'k1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.orderNo).toBe('PO-1');
    expect(handler).not.toHaveBeenCalled();
  });

  it('超长客户端 key 截断为 128 字符（防 key 注入撑爆 Redis）', async () => {
    const { app: appA } = buildApp();
    await post(appA, { 'X-Idempotency-Key': 'x'.repeat(300) });
    const { app: appB } = buildApp();
    await post(appB, { 'X-Idempotency-Key': `${'x'.repeat(128)}-tail-differs` });

    // 超出 128 的部分被丢弃 → 两个请求落在同一个 key 上
    expect(redisMock.set.mock.calls[0][0]).toMatch(HASHED_KEY);
    expect(redisMock.set.mock.calls[0][0]).toBe(redisMock.set.mock.calls[1][0]);
  });

  it('同一 key 在不同调用方之间隔离（防跨应用响应回放）', async () => {
    const { app: appA } = buildApp({}, 200, 'app-a');
    await post(appA, { 'X-Idempotency-Key': 'same-key' });
    const { app: appB } = buildApp({}, 200, 'app-b');
    await post(appB, { 'X-Idempotency-Key': 'same-key' });

    expect(redisMock.set.mock.calls[0][0]).not.toBe(redisMock.set.mock.calls[1][0]);
  });

  it('非 2xx 响应不缓存（仅 processing 占位，无第二次 set）', async () => {
    const { app } = buildApp({}, 400);
    await post(app, { 'X-Idempotency-Key': 'k-fail' });

    expect(redisMock.set).toHaveBeenCalledTimes(1);
  });
});

describe('idempotencyGuard - 自动指纹模式', () => {
  it('无 header 时按用户+方法+路径+body 指纹拦截重复', async () => {
    const { app, handler } = buildApp();
    const res1 = await post(app);
    expect(res1.status).toBe(200);

    const fingerprintKey = redisMock.set.mock.calls[0][0] as string;
    expect(fingerprintKey).toMatch(/^test:idempotency:[0-9a-f]{32}$/);

    // 第二次相同请求：SET NX 返回 null → 429
    redisMock.set.mockResolvedValueOnce(null);
    const res2 = await post(app);
    expect(res2.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('不同请求体产生不同指纹', async () => {
    const { app } = buildApp();
    await post(app, {}, '{"amount":100}');
    await post(app, {}, '{"amount":200}');

    const key1 = redisMock.set.mock.calls[0][0];
    const key2 = redisMock.set.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  it('查询串不同的请求产生不同指纹（开放 API 的 siteCode 等目标参数）', async () => {
    const { app } = buildApp();
    await app.request('/orders?siteCode=main', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await app.request('/orders?siteCode=tech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

    expect(redisMock.set.mock.calls[0][0]).not.toBe(redisMock.set.mock.calls[1][0]);
  });

  it('未登录时退化为来源 IP 指纹，且不同 IP 互不碰撞', async () => {
    asAnonymous();
    const { app: appA } = buildApp();
    const resA = await post(appA, { 'X-Forwarded-For': '1.2.3.4' });
    const keyA = placeholderKey();

    redisMock.set.mockClear();
    const { app: appB } = buildApp();
    await post(appB, { 'X-Forwarded-For': '5.6.7.8' });
    const keyB = placeholderKey();

    expect(resA.status).toBe(200);
    // 必须验证缓存 key 按 IP 隔离；仅检查状态码无法发现匿名请求共用缓存。
    expect(keyA).not.toBe(keyB);
  });

  it('连 IP 都取不到时才用固定兜底身份', async () => {
    asAnonymous();
    const { app } = buildApp();
    const res = await post(app);
    expect(res.status).toBe(200);
    expect(placeholderKey()).toMatch(HASHED_KEY);
  });

  it('autoFingerprint=false 且无 header → 直接放行，不触 Redis', async () => {
    const { app, handler } = buildApp({ autoFingerprint: false });
    const res = await post(app);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('idempotencyGuard - 请求内容一致性', () => {
  it('校验提前读取 JSON 后，不同表单仍产生不同指纹', async () => {
    const { app, handler } = buildApp({}, 200, undefined, true);
    await post(app, {}, '{"title":"A","menuIds":[1011]}');
    await post(app, {}, '{"title":"B","menuIds":[1021]}');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(placeholderKey(0)).not.toBe(placeholderKey(1));
  });

  it('同一客户端幂等键提交不同内容返回 409，不回放旧表单', async () => {
    const { app, handler } = buildApp({}, 200, undefined, true);
    await post(app, { 'X-Idempotency-Key': 'same' }, '{"title":"A"}');
    redisMock.get.mockResolvedValue(redisMock.eval.mock.calls[0][4] as string);
    const response = await post(app, { 'X-Idempotency-Key': 'same' }, '{"title":"B"}');
    expect(response.status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('业务异常和缓存结算异常不会再次执行业务', async () => {
    const handler = vi.fn(() => { throw new Error('business failure'); });
    const app = new Hono();
    app.onError((_err, c) => c.json({ code: 500 }, 500));
    app.post('/orders', idempotencyGuard(), handler);
    redisMock.eval.mockRejectedValue(new Error('cache unavailable'));
    const response = await post(app);
    expect(response.status).toBe(500);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('idempotencyGuard - 并发与容错', () => {
  it('GET 未命中但 SET NX 竞争失败 → 429（并发双击仅一次成功）', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValueOnce(null); // NX 已被并发请求抢占
    const { app, handler } = buildApp();
    const res = await post(app, { 'X-Idempotency-Key': 'race-key' });

    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it('Redis 不可用 → 降级放行（不阻断业务）', async () => {
    redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const { app, handler } = buildApp();
    const res = await post(app, { 'X-Idempotency-Key': 'k1' });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('缓存内容损坏（非 JSON）→ 按重复提交拒绝而非 500', async () => {
    redisMock.get.mockResolvedValue('corrupted-not-json');
    const { app } = buildApp();
    const res = await post(app, { 'X-Idempotency-Key': 'k1' });
    expect(res.status).toBe(429);
  });
});

describe('idempotencyGuard - 调用方身份隔离（缓存回放安全关键）', () => {
  /**
   * 会员身份取自 c.get('member')，不能仅用读取管理员身份的 currentUser()。
   * 同指纹请求须按会员隔离，避免签到、充值等操作被跳过并跨会员泄漏缓存响应。
   */
  it('不同会员的同一请求指纹必须不同', async () => {
    asMember(101);
    const { app: appA } = buildApp();
    await post(appA, {}, '');
    const keyA = placeholderKey();

    redisMock.set.mockClear();
    asMember(202);
    const { app: appB } = buildApp();
    await post(appB, {}, '');
    const keyB = placeholderKey();

    expect(keyA).not.toBe(keyB);
  });

  it('无请求体接口（如签到）同样按会员隔离', async () => {
    asMember(101);
    const { app: appA } = buildApp();
    await post(appA, {}, '');
    const keyA = placeholderKey();

    redisMock.set.mockClear();
    asMember(102);
    const { app: appB } = buildApp();
    await post(appB, {}, '');

    expect(keyA).not.toBe(placeholderKey());
  });

  it('同一会员的重复提交仍然命中同一 key（幂等本身不能失效）', async () => {
    asMember(101);
    const { app: appA } = buildApp();
    await post(appA, {}, '');
    const keyA = placeholderKey();

    redisMock.set.mockClear();
    const { app: appB } = buildApp();
    await post(appB, {}, '');

    expect(placeholderKey()).toBe(keyA);
  });

  it('会员与管理员即使 id 相同也不串号', async () => {
    asMember(7);
    const { app: appM } = buildApp();
    await post(appM);
    const keyMember = placeholderKey();

    redisMock.set.mockClear();
    asAdmin(7);
    const { app: appA } = buildApp();
    await post(appA);

    expect(placeholderKey()).not.toBe(keyMember);
  });

  it('不同租户的同 id 管理员不碰撞（多租户 userId 序列可能重合）', async () => {
    asAdmin(5, 1);
    const { app: appT1 } = buildApp();
    await post(appT1);
    const keyT1 = placeholderKey();

    redisMock.set.mockClear();
    asAdmin(5, 2);
    const { app: appT2 } = buildApp();
    await post(appT2);

    expect(placeholderKey()).not.toBe(keyT1);
  });

  it('开放应用优先于会员/管理员上下文（网关请求身份取 AppKey）', async () => {
    asMember(101);
    const { app } = buildApp({}, 200, 'app-x');
    await post(app);
    const keyWithApp = placeholderKey();

    redisMock.set.mockClear();
    asMember(101);
    const { app: appNoKey } = buildApp();
    await post(appNoKey);

    expect(placeholderKey()).not.toBe(keyWithApp);
  });

  it('客户端 Token 模式下同样按会员隔离（同 key 不同会员不共享缓存）', async () => {
    asMember(101);
    const { app: appA } = buildApp();
    await post(appA, { 'X-Idempotency-Key': 'same-key' });
    const keyA = placeholderKey();

    redisMock.set.mockClear();
    asMember(202);
    const { app: appB } = buildApp();
    await post(appB, { 'X-Idempotency-Key': 'same-key' });

    expect(placeholderKey()).not.toBe(keyA);
  });
});
