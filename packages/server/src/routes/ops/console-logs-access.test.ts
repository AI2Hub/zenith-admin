import type { Context, Next } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  multiTenantMode: true,
  user: { userId: 7, username: 'operator', tenantId: 12 as number | null, roles: ['tenant_admin'] },
}));

vi.mock('../../config', async (original) => {
  const actual = await original<typeof import('../../config')>();
  return { ...actual, config: { ...actual.config, get multiTenantMode() { return state.multiTenantMode; } } };
});
// 权限层显式放行：模拟已经拥有 system:log:console 的主体，验证仍不能绕过真实平台守卫。
vi.mock('../../middleware/guard', () => ({
  guard: () => async (_c: Context, next: Next) => { await next(); },
}));
vi.mock('../../middleware/auth', () => ({
  authMiddleware: async (c: Context, next: Next) => { c.set('user', state.user); await next(); },
}));

const service = vi.hoisted(() => ({
  getConsoleLogSources: vi.fn(async () => ({ currentRole: 'api', hostname: 'local', pid: 12, sources: [] })),
  readConsoleLogLines: vi.fn(async () => ['platform application output']),
  tailConsoleLogLines: vi.fn(async () => {}),
}));
vi.mock('../../services/ops/console-logs.service', () => service);

// platform-admin 与 tenant 模块保持真实实现；契约负责自动挂载守卫。
const { default: router } = await import('./console-logs');

beforeEach(() => {
  vi.clearAllMocks();
  state.multiTenantMode = true;
  state.user = { userId: 7, username: 'operator', tenantId: 12, roles: ['tenant_admin'] };
});

const endpoints = ['/', '/content', '/tail'] as const;

describe('控制台日志的平台隔离', () => {
  it.each(endpoints)('多租户下拥有日志权限的租户用户仍被拒绝：%s', async (endpoint) => {
    const response = await router.request(endpoint);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: '仅平台管理员可执行此操作' });
    Object.values(service).forEach((method) => expect(method).not.toHaveBeenCalled());
  });

  it.each(endpoints)('租户内 super_admin 也不能读取全平台日志：%s', async (endpoint) => {
    state.user.roles = ['super_admin'];
    const response = await router.request(endpoint);
    expect(response.status).toBe(403);
    Object.values(service).forEach((method) => expect(method).not.toHaveBeenCalled());
  });

  it.each(endpoints)('平台 super_admin 可访问：%s', async (endpoint) => {
    state.user.tenantId = null;
    state.user.roles = ['super_admin'];
    const response = await router.request(endpoint);
    expect(response.status).toBe(200);
    await response.text();
  });

  it.each(endpoints)('单租户部署由日志权限控制，普通授权用户可访问：%s', async (endpoint) => {
    state.multiTenantMode = false;
    const response = await router.request(endpoint);
    expect(response.status).toBe(200);
    await response.text();
  });
});
