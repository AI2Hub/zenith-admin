/**
 * /api/settings 路由装配测试。
 *
 * 覆盖要点：
 *  1. 13 个模块各注册 GET + PUT 字面量路径，与契约 fullPath 一致
 *  2. /public 匿名可达；/me、模块端点无凭证 → 401
 *  3. PUT 请求体：缺字段 → 400；完整文档 → 交给 saveSettings 并返回信封
 *  4. 契约 access / audit / feature 直接取模块定义（readPermission / writePermission / feature），guard 拿到的即注册表元数据
 *
 * Mock 策略：lib/settings 全部 mock（不测数据行为）；authMiddleware 真实实现 + 测试 JWT；guard 记录入参后直通（契约装配的门禁链仍经过它）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { contextStorage } from 'hono/context-storage';
import { SETTINGS_MODULES, SETTINGS_MODULE_KEYS, settingsGetOp, settingsUpdateOp, settingsHistoryOps } from '@zenith/shared/settings';

const BASE_TOKEN = 'a'.repeat(64);

const { guardCalls } = vi.hoisted(() => ({ guardCalls: [] as unknown[] }));

vi.mock('../../config', () => ({
  config: {
    jwtSecret: 'unit-test-only-fake-secret-do-not-use-in-production',
    jwtRefreshSecret: 'unit-test-only-fake-refresh-secret',
    multiTenantMode: false,
    licenseMode: 'off',
    redis: { keyPrefix: 'test:' },
    settings: { cacheTtlMs: 30_000 },
    log: { level: 'silent', dir: 'logs', maxFiles: '30d' },
  },
}));

vi.mock('../../db', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { from: () => chain, leftJoin: () => chain, where: () => chain, limit: async () => [{ username: 'admin', status: 'enabled', tenantId: null, tenantStatus: null, tenantExpireAt: null }] };
  return { db: { select: () => chain }, pgClient: { listen: vi.fn() } };
});

vi.mock('../../lib/session-manager', () => ({
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  getTokenRevocation: vi.fn().mockResolvedValue(null),
  touchSession: vi.fn().mockResolvedValue(true),
  registerSession: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

vi.mock('../../middleware/guard', () => ({
  guard: (opts: unknown) => {
    guardCalls.push(opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (_c: any, next: () => Promise<void>) => next();
  },
  setAuditBeforeData: vi.fn(),
}));

vi.mock('../../lib/settings', () => ({
  listSettingsModules: vi.fn(async () => []),
  getPublicSettings: vi.fn(async () => ({ auth: {}, identitySecurity: {} })),
  getMySettings: vi.fn(async () => ({ auth: {}, identitySecurity: {}, ui: {} })),
  getSettingsEnvelope: vi.fn(async (module: string) => ({
    module, scope: 'platform', tenantId: null, version: 2,
    effective: {}, inherited: {}, overrides: {}, currentRevisionId: 2, baseToken: 'a'.repeat(64), definitionHash: 'd'.repeat(64), inheritedVersion: 0, overriddenPaths: [], updatedAt: null,
  })),
  saveSettings: vi.fn(async (module: string, _user: unknown, _input: unknown) => ({
    module, scope: 'platform', tenantId: null, version: 3,
    effective: {}, inherited: {}, overriddenPaths: [], updatedAt: null,
  })),
  restoreSettings: vi.fn(async () => ({ module: 'ui', scope: 'platform', tenantId: null, version: 4, currentRevisionId: 4, baseToken: 'b'.repeat(64), definitionHash: 'd'.repeat(64), overrides: {}, inheritedVersion: 0, effective: {}, inherited: {}, overriddenPaths: [], updatedAt: null })),
}));
vi.mock('../../services/platform/settings-history.service', () => ({
  listSettingsVersions: vi.fn(async () => ({ list: [], total: 0, page: 1, pageSize: 20 })),
  getSettingsVersion: vi.fn(async () => ({ id: 0, version: 0, action: 'initial', note: '', actorId: null, actorName: '系统默认', createdAt: null, changedPaths: [], restoredFromVersion: null, overrides: {}, effective: {}, inherited: {}, definition: {}, definitionHash: '', inheritedVersion: 0 })),
  compareSettingsVersions: vi.fn(async () => ({ fromVersion: 0, toVersion: 1, changes: [] })),
  previewSettingsRestore: vi.fn(async () => ({ baseToken: 'a'.repeat(64), currentVersion: 3, targetVersion: 0, current: {}, restored: {}, changes: [], issues: [] })),
}));

import settingsRoutes from './settings';
import { getSettingsEnvelope, saveSettings, restoreSettings } from '../../lib/settings';

async function token() {
  return sign({ userId: 1, username: 'admin', roles: ['super_admin'], tenantId: null, jti: 'j1', exp: Math.floor(Date.now() / 1000) + 600 }, 'unit-test-only-fake-secret-do-not-use-in-production');
}

function buildApp() {
  const app = new Hono();
  app.use('*', contextStorage());
  app.route('/api/settings', settingsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settings routes', () => {
  it('每个模块的 GET / PUT 都已注册（与契约 fullPath 一致），无凭证 → 401', async () => {
    const app = buildApp();
    for (const module of SETTINGS_MODULE_KEYS) {
      const get = settingsGetOp(module);
      const put = settingsUpdateOp(module);
      expect((await app.request(get.fullPath)).status).toBe(401);
      expect((await app.request(put.fullPath, { method: 'PUT' })).status).toBe(401);
    }
    expect((await app.request('/api/settings/me')).status).toBe(401);
    expect((await app.request('/api/settings')).status).toBe(401);
  });

  it('/public 匿名可达', async () => {
    const res = await buildApp().request('/api/settings/public?tenantCode=acme');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 0, data: { auth: {}, identitySecurity: {} } });
  });

  it('GET 模块端点返回信封', async () => {
    const res = await buildApp().request('/api/settings/identity-security', { headers: { Authorization: `Bearer ${await token()}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 0, data: { module: 'identitySecurity', version: 2 } });
    expect(getSettingsEnvelope).toHaveBeenCalledWith('identitySecurity');
  });

  it('PUT 缺字段 → 400；完整文档 → 保存并返回新版本', async () => {
    const app = buildApp();
    const headers = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
    const bad = await app.request('/api/settings/ui', { method: 'PUT', headers, body: JSON.stringify({ version: 2, data: { quickChatEnabled: true } }) });
    expect(bad.status).toBe(400);
    expect(saveSettings).not.toHaveBeenCalled();

    const overrides = { watermark: { enabled: false } };
    const ok = await app.request('/api/settings/ui', { method: 'PUT', headers, body: JSON.stringify({ baseToken: BASE_TOKEN, overrides }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ code: 0, data: { module: 'ui', version: 3 } });
    expect(saveSettings).toHaveBeenCalledWith('ui', expect.objectContaining({ userId: 1 }), { baseToken: BASE_TOKEN, overrides });

    const unknownKey = await app.request('/api/settings/ui', { method: 'PUT', headers, body: JSON.stringify({ baseToken: BASE_TOKEN, overrides: { extra: 1 } }) });
    expect(unknownKey.status).toBe(400);
  });

  it('契约装配的 guard 拿到模块定义的 feature / 权限 / 审计元数据', () => {
    const driveWrite = guardCalls.find((g) => (g as { audit?: { description?: string } }).audit?.description === '更新「企业网盘」设置');
    expect(driveWrite).toMatchObject({ feature: 'drive', permission: ['drive:setting:edit'], audit: { module: '系统设置' } });
    const ipRead = guardCalls.find((g) => JSON.stringify((g as { permission?: string[] }).permission) === JSON.stringify(['system:ip-access:view']) && !(g as { audit?: unknown }).audit);
    expect(ipRead).toMatchObject({ permission: ['system:ip-access:view'] });
    expect(ipRead).not.toHaveProperty('feature');
    // 契约本身即为唯一来源
    expect(settingsGetOp('drive').access).toEqual({ permission: 'drive:setting:view' });
    expect(settingsUpdateOp('drive')).toMatchObject({ access: { permission: 'drive:setting:edit' }, feature: 'drive', audit: { description: '更新「企业网盘」设置', module: '系统设置' } });
  });

  it('偏好策略值经过真实写入契约校验，非法枚举与范围不能入库', async () => {
    const app = buildApp();
    const headers = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
    for (const overrides of [ { colorMode: 'invalid' }, { tablePageSize: -1 } ]) {
      const full = SETTINGS_MODULES.ui.schema.parse({});
      const data = { ...full, preferences: { ...full.preferences, defaults: { ...full.preferences.defaults, ...overrides } } };
      const response = await app.request('/api/settings/ui', { method: 'PUT', headers, body: JSON.stringify({ baseToken: BASE_TOKEN, overrides: data }) });
      expect(response.status).toBe(400);
    }
    expect(saveSettings).not.toHaveBeenCalled();
  });
});


describe('设置版本接口', () => {
  it('每个模块的历史、比较、预览、恢复都经过认证，静态compare路由优先于version', async () => {
    const app = buildApp();
    for (const module of SETTINGS_MODULE_KEYS) {
      const ops = settingsHistoryOps(module);
      for (const op of [ops.list, ops.compare, ops.detail, ops.preview, ops.restore]) {
        const response = await app.request(op.fullPath.replace('{version}', '0'), { method: op.method.toUpperCase() });
        expect(response.status, op.fullPath).toBe(401);
      }
    }
  });
  it('恢复要求说明和并发指纹，v0可恢复', async () => {
    const app = buildApp();
    const headers = { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' };
    const route = settingsHistoryOps('ui').restore.fullPath.replace('{version}', '0');
    expect((await app.request(route, { method: 'POST', headers, body: JSON.stringify({ baseToken: BASE_TOKEN, note: ' ' }) })).status).toBe(400);
    expect(restoreSettings).not.toHaveBeenCalled();
    const response = await app.request(route, { method: 'POST', headers, body: JSON.stringify({ baseToken: BASE_TOKEN, note: '恢复继承' }) });
    expect(response.status).toBe(200);
    expect(restoreSettings).toHaveBeenCalledWith('ui', expect.objectContaining({ userId: 1 }), 0, { baseToken: BASE_TOKEN, note: '恢复继承' });
    expect((await app.request(settingsHistoryOps('ui').compare.fullPath + '?from=0&to=1', { headers })).status).toBe(200);
  });
});
