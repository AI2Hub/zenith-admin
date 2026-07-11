/**
 * 可选认证中间件（optionalAuthMiddleware）测试。
 *
 * 行为中心阶段 1 关键改动：有效会员 token（type='member'）不再降级匿名，
 * 而是注入 c.set('member')；管理员 token 仍注入 c.set('user')；两者互斥；
 * 无效/缺失 token 按匿名继续。同时验证本中间件不触发会员会话的 Redis 副作用
 * （不同于 memberAuthMiddleware 的黑名单校验 / 会话续期）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { contextStorage } from 'hono/context-storage';

const TEST_JWT_SECRET = 'unit-test-only-fake-secret-do-not-use-in-production';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'unit-test-only-fake-secret-do-not-use-in-production',
    jwtRefreshSecret: 'unit-test-only-fake-refresh-secret',
    port: 3300,
    databaseUrl: 'mock://localhost/test',
    multiTenantMode: false,
    redis: { keyPrefix: 'test:' },
    log: { level: 'silent', dir: 'logs', maxFiles: '30d' },
  },
}));

// 关键断言：optionalAuthMiddleware 绝不应触发会员会话的 Redis 副作用（黑名单校验 / 会话续期），
// 因此这里让这些函数在被调用时直接抛错，一旦中间件误调用即可在测试中暴露。
vi.mock('../lib/member-session-manager', () => ({
  isMemberTokenBlacklisted: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch member session redis state');
  }),
  touchMemberSession: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch member session redis state');
  }),
  registerMemberSession: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch member session redis state');
  }),
}));

vi.mock('../lib/session-manager', () => ({
  isTokenBlacklisted: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch admin session redis state');
  }),
  touchSession: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch admin session redis state');
  }),
  registerSession: vi.fn(() => {
    throw new Error('optionalAuthMiddleware must not touch admin session redis state');
  }),
}));

import { optionalAuthMiddleware } from './optional-auth';

const now = () => Math.floor(Date.now() / 1000);

async function makeMemberToken(overrides: Record<string, unknown> = {}) {
  return sign(
    { memberId: 1, identifier: '13800138000', type: 'member', tenantId: null, jti: 'member-jti', iat: now(), exp: now() + 3600, ...overrides },
    TEST_JWT_SECRET,
    'HS256',
  );
}

async function makeAdminToken(overrides: Record<string, unknown> = {}) {
  return sign(
    { userId: 1, username: 'admin', roles: ['admin'], tenantId: null, jti: 'admin-jti', iat: now(), exp: now() + 3600, ...overrides },
    TEST_JWT_SECRET,
    'HS256',
  );
}

function buildApp() {
  const app = new Hono();
  app.use('*', contextStorage());
  app.get('/probe', optionalAuthMiddleware, (c) => {
    const user = c.get('user');
    const member = c.get('member');
    return c.json({ code: 0, message: 'ok', data: { user: user ?? null, member: member ?? null } });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('optionalAuthMiddleware - 可选认证（采集接口）', () => {
  it('无 Authorization 头 → 匿名（user/member 均不注入）', async () => {
    const res = await buildApp().request('/probe');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.member).toBeNull();
  });

  it('合法管理员 token → 注入 user，不注入 member', async () => {
    const token = await makeAdminToken();
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user?.userId).toBe(1);
    expect(body.data.member).toBeNull();
  });

  it('合法会员 token（type=member）→ 注入 member，不注入 user，且不触发 Redis 会话副作用', async () => {
    const token = await makeMemberToken();
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.member?.memberId).toBe(1);
    expect(body.data.user).toBeNull();
  });

  it('缺少 memberId 的会员 token → 既不注入 user 也不注入 member（按匿名处理）', async () => {
    const token = await makeMemberToken({ memberId: undefined });
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.member).toBeNull();
  });

  it('无效 JWT 字符串 → 静默按匿名处理（不 401）', async () => {
    const res = await buildApp().request('/probe', { headers: { Authorization: 'Bearer not-a-real-jwt' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.member).toBeNull();
  });

  it('过期管理员 token → 静默按匿名处理（不 401）', async () => {
    const token = await makeAdminToken({ iat: now() - 10, exp: now() - 1 });
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.member).toBeNull();
  });

  it('过期会员 token → 静默按匿名处理（不 401）', async () => {
    const token = await makeMemberToken({ iat: now() - 10, exp: now() - 1 });
    const res = await buildApp().request('/probe', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.member).toBeNull();
  });
});
