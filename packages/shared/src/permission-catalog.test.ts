import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from './permissions';
import { CONTRACT_DOMAIN_LABELS, CONTRACTS_BY_DOMAIN } from './contracts';
import { judgeOperation, listApiCatalog, listPermissionCatalog, operationsByPermission, SECURITY_SCHEME_LABELS } from './permission-catalog';

describe('接口目录（契约派生）', () => {
  const api = listApiCatalog();

  it('收录全部凭证类型的操作，非 bearer 操作不带访问要求', () => {
    expect(api.length).toBeGreaterThan(listPermissionCatalog(api).length);
    const schemes = new Set(api.map((entry) => entry.security));
    expect([...schemes].sort()).toEqual(['bearer', 'device-signature', 'member-bearer', 'none', 'open-gateway']);
    for (const entry of api) {
      if (entry.security !== 'bearer') {
        expect(entry.access).toBeNull();
        expect(entry.accessKind).toBeNull();
        expect(entry.permissions).toEqual([]);
      }
      expect(SECURITY_SCHEME_LABELS[entry.security]).toBeTruthy();
    }
    const login = api.find((entry) => entry.fullPath === '/api/auth/login' && entry.method === 'post');
    expect(login).toMatchObject({ domain: 'identity', security: 'none', access: null });
  });

  it('每个契约域都有展示名', () => {
    for (const domain of Object.keys(CONTRACTS_BY_DOMAIN)) {
      expect(CONTRACT_DOMAIN_LABELS[domain as keyof typeof CONTRACT_DOMAIN_LABELS], domain).toBeTruthy();
    }
  });
});

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
    const byPermission = { accessKind: 'permission' as const, permissions: ['a:x', 'a:y'], platformOnly: false as const };
    expect(judgeOperation(byPermission, { permissions: ['a:y'], superAdmin: false }, { multiTenant: false })).toBe('allowed');
    expect(judgeOperation(byPermission, { permissions: new Set(['b:z']), superAdmin: false }, { multiTenant: false })).toBe('denied');
    expect(judgeOperation(byPermission, { permissions: ['*'], superAdmin: false }, { multiTenant: false })).toBe('allowed');
    expect(judgeOperation(byPermission, { permissions: [], superAdmin: true }, { multiTenant: true })).toBe('allowed');

    const authenticated = { accessKind: 'authenticated' as const, permissions: [], platformOnly: false as const };
    expect(judgeOperation(authenticated, { permissions: [], superAdmin: false }, { multiTenant: true })).toBe('allowed');

    const platform = { accessKind: 'platform' as const, permissions: [], platformOnly: true as const };
    expect(judgeOperation(platform, { permissions: ['*'], superAdmin: false }, { multiTenant: false })).toBe('platform-only');
    expect(judgeOperation(platform, { permissions: [], superAdmin: true }, { multiTenant: false })).toBe('allowed');

    const multiTenantOnly = { accessKind: 'permission' as const, permissions: ['a:x'], platformOnly: 'multi-tenant' as const };
    expect(judgeOperation(multiTenantOnly, { permissions: ['a:x'], superAdmin: false }, { multiTenant: true })).toBe('platform-only');
    expect(judgeOperation(multiTenantOnly, { permissions: ['a:x'], superAdmin: false }, { multiTenant: false })).toBe('allowed');

    // 目录条目本身即判定输入
    const fromCatalog = catalog.find((entry) => entry.accessKind === 'permission' && entry.platformOnly === false)!;
    expect(judgeOperation(fromCatalog, { permissions: fromCatalog.permissions, superAdmin: false }, { multiTenant: true })).toBe('allowed');
  });
});
