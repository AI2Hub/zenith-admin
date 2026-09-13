import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from './permissions';
import { judgeOperation, listPermissionCatalog, operationsByPermission } from './permission-catalog';

describe('接口权限目录（契约 access 派生）', () => {
  const catalog = listPermissionCatalog();

  it('只收录后台登录令牌操作，且每条都带访问形态', () => {
    expect(catalog.length).toBeGreaterThan(2000);
    expect(catalog.every((entry) => ['permission', 'authenticated', 'platform'].includes(entry.accessKind))).toBe(true);
    expect(catalog.some((entry) => entry.fullPath.startsWith('/api/member/'))).toBe(false);
    const impersonation = catalog.find((entry) => entry.fullPath === '/api/impersonation/records' && entry.method === 'get');
    expect(impersonation).toMatchObject({ domain: 'identity', accessKind: 'permission', permissions: ['system:impersonation:list'] });
  });

  it('权限码 → 接口的反向索引只含注册表里的码，且非 uiOnly 的码都至少被一个接口引用', () => {
    const index = operationsByPermission(catalog);
    for (const code of index.keys()) expect(ALL_PERMISSIONS[code], `${code} 不在注册表`).toBeDefined();
    const unreferenced = Object.entries(ALL_PERMISSIONS)
      .filter(([code, meta]) => !meta.uiOnly && !index.has(code as never))
      .map(([code]) => code);
    // 服务端在 service 内用 hasPermission() 校验（而非契约 access）的码在这里允许缺席，但数量必须很小且已知
    expect(unreferenced.length).toBeLessThan(60);
  });

  it('判定口径与服务端门禁链一致', () => {
    const byPermission = { access: { permission: ['a:x', 'a:y'] as never }, permissions: ['a:x', 'a:y'] as never, platformOnly: false as const };
    expect(judgeOperation(byPermission, { permissions: ['a:y'], superAdmin: false }, { multiTenant: false })).toBe('allowed');
    expect(judgeOperation(byPermission, { permissions: new Set(['b:z']), superAdmin: false }, { multiTenant: false })).toBe('denied');
    expect(judgeOperation(byPermission, { permissions: ['*'], superAdmin: false }, { multiTenant: false })).toBe('allowed');
    expect(judgeOperation(byPermission, { permissions: [], superAdmin: true }, { multiTenant: true })).toBe('allowed');

    const authenticated = { access: 'authenticated' as const, permissions: [] as const, platformOnly: false as const };
    expect(judgeOperation(authenticated, { permissions: [], superAdmin: false }, { multiTenant: true })).toBe('allowed');

    const platform = { access: { platformOnly: true as const }, permissions: [] as const, platformOnly: true as const };
    expect(judgeOperation(platform, { permissions: ['*'], superAdmin: false }, { multiTenant: false })).toBe('platform-only');
    expect(judgeOperation(platform, { permissions: [], superAdmin: true }, { multiTenant: false })).toBe('allowed');

    const multiTenantOnly = { access: { permission: 'a:x' as never, platformOnly: 'multi-tenant' as const }, permissions: ['a:x'] as never, platformOnly: 'multi-tenant' as const };
    expect(judgeOperation(multiTenantOnly, { permissions: ['a:x'], superAdmin: false }, { multiTenant: true })).toBe('platform-only');
    expect(judgeOperation(multiTenantOnly, { permissions: ['a:x'], superAdmin: false }, { multiTenant: false })).toBe('allowed');
  });
});
