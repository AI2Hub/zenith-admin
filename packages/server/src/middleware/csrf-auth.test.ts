/**
 * CSRF → 真实 Bearer 认证 → 权限守卫的内存集成回归。
 * 只替换数据库、会话与权限来源；JWT 验签、PAT 校验、主体活性和路由门禁实际执行。
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { HTTPException } from 'hono/http-exception';
import { sign } from 'hono/jwt';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  tokenLookup: vi.fn(),
  permissions: vi.fn(),
  tokenRevocation: vi.fn(),
  touchSession: vi.fn(),
  memberTokenRevocation: vi.fn(),
  touchMemberSession: vi.fn(),
  handled: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'csrf-test-only-fake-secret-do-not-use-in-production',
    jwtRefreshSecret: 'csrf-test-only-fake-refresh-secret',
    databaseUrl: 'mock://localhost/test',
    multiTenantMode: true,
    licenseMode: 'off',
    redis: { keyPrefix: 'test:' },
    log: { level: 'silent', dir: 'logs', maxFiles: '30d' },
  },
}));

vi.mock('../db', () => ({
  db: {
    select: mocks.select,
    query: { userApiTokens: { findFirst: mocks.tokenLookup } },
  },
}));

vi.mock('../lib/session-manager', () => ({
  getTokenRevocation: mocks.tokenRevocation,
  touchSession: mocks.touchSession,
  registerSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/member-session-manager', () => ({
  getMemberTokenRevocation: mocks.memberTokenRevocation,
  touchMemberSession: mocks.touchMemberSession,
  registerMemberSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/permissions', () => ({
  isSuperAdmin: (user: { roles: string[] }) => user.roles.includes('super_admin'),
  getUserPermissions: mocks.permissions,
}));

vi.mock('../lib/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { errBody, okBody } from '../lib/openapi-schemas';
import { authMiddleware, resetAdminSubjectCache } from './auth';
import { createCsrfMiddleware } from './csrf';
import { guard } from './guard';
import { memberAuthMiddleware, resetMemberSubjectCache } from './member-auth';

const TEST_JWT_SECRET = 'csrf-test-only-fake-secret-do-not-use-in-production';
const PAT = 'zat_csrf_integration_test_personal_token';
const ADMIN_PATH = '/api/wiki/docs/1';
const MEMBER_PATH = '/api/member/favorites/1';
const now = () => Math.floor(Date.now() / 1000);

function createChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'leftJoin', 'where', 'limit']) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function activeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: 'wiki-editor',
    nickname: 'Wiki Editor',
    email: null,
    avatar: null,
    status: 'enabled',
    tenantId: 7,
    tenantStatus: 'enabled',
    tenantExpireAt: null,
    ...overrides,
  };
}

function activeTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    userId: 1,
    expiresAt: null,
    lastUsedAt: new Date(),
    user: { userRoles: [{ role: { code: 'editor', status: 'enabled' } }] },
    ...overrides,
  };
}

function makeAdminToken(overrides: Record<string, unknown> = {}) {
  return sign({
    userId: 1,
    username: 'wiki-editor',
    roles: ['editor'],
    tenantId: 7,
    jti: 'admin-csrf-jti',
    iat: now(),
    exp: now() + 3600,
    ...overrides,
  }, TEST_JWT_SECRET, 'HS256');
}

function makeMemberToken() {
  return sign({
    memberId: 1,
    identifier: 'alice',
    type: 'member',
    tenantId: 7,
    jti: 'member-csrf-jti',
    iat: now(),
    exp: now() + 3600,
  }, TEST_JWT_SECRET, 'HS256');
}

function buildApp() {
  const app = new Hono();
  app.use('*', contextStorage());
  app.use('/api/*', createCsrfMiddleware({ allowedOrigins: ['https://admin.example.test'] }));
  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500;
    return c.json(errBody(error.message || '请求失败', status), status);
  });

  const admin = new Hono();
  admin.on(['DELETE', 'POST'], '/wiki/docs/:id', authMiddleware, guard({ permission: 'wiki:doc:delete' }), (c) => {
    const user = c.get('user');
    mocks.handled(user);
    return c.json(okBody({ userId: user.userId, tenantId: user.tenantId, authType: user.authType ?? 'jwt' }), 200);
  });
  app.route('/api', admin);

  app.delete('/api/member/favorites/:id', memberAuthMiddleware, (c) => {
    const member = c.get('member');
    mocks.handled(member);
    return c.json(okBody({ memberId: member.memberId }), 200);
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAdminSubjectCache();
  resetMemberSubjectCache();
  mocks.select.mockReturnValue(createChain([activeUserRow()]));
  mocks.tokenLookup.mockResolvedValue(activeTokenRow());
  mocks.permissions.mockResolvedValue(['wiki:doc:delete']);
  mocks.tokenRevocation.mockResolvedValue(null);
  mocks.touchSession.mockResolvedValue(true);
  mocks.memberTokenRevocation.mockResolvedValue(null);
  mocks.touchMemberSession.mockResolvedValue(true);
});

const requestCases = [
  { name: '无请求体 DELETE', init: () => ({ method: 'DELETE' }) },
  { name: 'URL encoded POST', init: () => ({ method: 'POST', body: new URLSearchParams({ title: '测试' }) }) },
  {
    name: 'multipart POST',
    init: () => {
      const body = new FormData();
      body.append('file', new Blob(['Wiki attachment'], { type: 'text/plain' }), 'wiki.txt');
      return { method: 'POST', body };
    },
  },
  { name: 'JSON POST', init: () => ({ method: 'POST', body: JSON.stringify({ title: '测试' }), headers: { 'Content-Type': 'application/json' } }) },
];

describe('CSRF 与实际管理员认证链', () => {
  describe.each(['jwt', 'apiToken'] as const)('%s', (authType) => {
    it.each(requestCases)('无 Origin 的 $name 通过认证和权限后成功', async ({ init }) => {
      const token = authType === 'jwt' ? await makeAdminToken() : PAT;
      const requestInit = init();
      const headers = new Headers('headers' in requestInit ? requestInit.headers : undefined);
      headers.set('Authorization', `Bearer ${token}`);
      const response = await buildApp().request(ADMIN_PATH, { ...requestInit, headers });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(okBody({ userId: 1, tenantId: 7, authType }));
      expect(mocks.permissions).toHaveBeenCalledWith(1);
      expect(mocks.handled).toHaveBeenCalledOnce();
      if (authType === 'apiToken') {
        const lookup = mocks.tokenLookup.mock.calls[0][0];
        expect(new PgDialect().sqlToQuery(lookup.where).params).toEqual([
          createHash('sha256').update(PAT).digest('hex'),
        ]);
      } else {
        expect(mocks.tokenRevocation).toHaveBeenCalledWith('admin-csrf-jti');
        expect(mocks.touchSession).toHaveBeenCalledWith('admin-csrf-jti');
      }
    });

    it('有效令牌缺少权限仍然返回 403 权限不足', async () => {
      mocks.permissions.mockResolvedValue([]);
      const token = authType === 'jwt' ? await makeAdminToken() : PAT;
      const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(errBody('权限不足', 403));
      expect(mocks.handled).not.toHaveBeenCalled();
    });
  });

  it.each([
    { name: 'JWT 格式错误', token: () => Promise.resolve('invalid.jwt.token') },
    { name: 'JWT 已过期', token: () => makeAdminToken({ iat: now() - 60, exp: now() - 1 }) },
  ])('$name 返回 401 而不是 CSRF 403', async ({ token }) => {
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('登录已过期', 401));
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'PAT 不存在', row: () => undefined },
    { name: 'PAT 已过期', row: () => activeTokenRow({ expiresAt: new Date(Date.now() - 1000) }) },
  ])('$name 返回 401', async ({ row }) => {
    mocks.tokenLookup.mockResolvedValue(row());
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${PAT}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('API Token 无效或已过期', 401));
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });

  it.each([
    { name: '账号禁用', row: { status: 'disabled' }, message: '账号已被禁用' },
    { name: '租户禁用', row: { tenantStatus: 'disabled' }, message: '租户已被禁用或过期' },
    { name: '租户过期', row: { tenantExpireAt: new Date(Date.now() - 1000) }, message: '租户已被禁用或过期' },
  ])('JWT 的$name校验仍返回 403', async ({ row, message }) => {
    mocks.select.mockReturnValue(createChain([activeUserRow(row)]));
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await makeAdminToken()}` } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(errBody(message, 403));
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });

  it.each([
    { name: '账号禁用', row: { status: 'disabled' } },
    { name: '租户禁用', row: { tenantStatus: 'disabled' } },
  ])('PAT 的$name校验仍拒绝访问', async ({ row }) => {
    mocks.select.mockReturnValue(createChain([activeUserRow(row)]));
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${PAT}` } });
    // PAT 既有认证语义将主体不可用统一折叠为无效凭据。
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('API Token 无效或已过期', 401));
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });

  it('租户声明不匹配的 JWT 仍返回 401', async () => {
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await makeAdminToken({ tenantId: 8 })}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('登录状态已失效，请重新登录', 401));
    expect(mocks.handled).not.toHaveBeenCalled();
  });

  it('会员令牌不能访问管理端', async () => {
    const response = await buildApp().request(ADMIN_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await makeMemberToken()}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('无效的访问令牌', 401));
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });
});

describe('CSRF 与实际会员认证链', () => {
  it('有效会员 Bearer 无 Origin 的 DELETE 成功并保留会员会话检查', async () => {
    mocks.select.mockReturnValue(createChain([activeUserRow({ status: 'active', phone: null })]));
    const response = await buildApp().request(MEMBER_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await makeMemberToken()}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(okBody({ memberId: 1 }));
    expect(mocks.memberTokenRevocation).toHaveBeenCalledWith('member-csrf-jti');
    expect(mocks.touchMemberSession).toHaveBeenCalledWith('member-csrf-jti');
  });

  it('管理员令牌不能访问会员端', async () => {
    const response = await buildApp().request(MEMBER_PATH, { method: 'DELETE', headers: { Authorization: `Bearer ${await makeAdminToken()}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(errBody('无效的会员令牌', 401));
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.handled).not.toHaveBeenCalled();
  });
});
