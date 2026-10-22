import { createPreferencesContext } from '@/test-utils/preferences';
import { act, render, screen,} from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { apiCatalogContract, permissionMatrixContract, type ApiCatalog, type ApiCatalogItem } from '@zenith/shared/identity';
import { PreferencesContext } from '@/hooks/usePreferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import {} from '@/test-utils/toolbar';
import { EMPTY_FILTERS, matchesCatalogFilters, summarizeCatalog, toCatalogRows } from './catalog-model';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: () => true }) }));

import { apiCatalogKeys } from '@/hooks/queries/permission-matrix';
import ApiCatalogPage from './ApiCatalogPage';

const prefs = createPreferencesContext();

function item(partial: Partial<ApiCatalogItem> & Pick<ApiCatalogItem, 'method' | 'fullPath' | 'summary'>): ApiCatalogItem {
  return {
    domain: 'identity',
    domainLabel: '身份与组织',
    basePath: '/api/users',
    name: partial.method,
    description: null,
    tags: [],
    deprecated: false,
    security: 'bearer',
    accessKind: 'authenticated',
    permissions: [],
    platformOnly: false,
    audit: null,
    feature: null,
    ...partial,
  };
}

const catalog: ApiCatalog = {
  items: [
    item({ method: 'post', fullPath: '/api/auth/login', summary: '登录', basePath: '/api/auth', security: 'none', accessKind: null }),
    item({ method: 'get', fullPath: '/api/auth/me', summary: '当前用户', basePath: '/api/auth' }),
    item({ method: 'get', fullPath: '/api/users', summary: '用户列表', accessKind: 'permission', permissions: ['system:user:list'], audit: '查询用户' }),
    item({ method: 'delete', fullPath: '/api/users/{id}', summary: '删除用户', accessKind: 'permission', permissions: ['system:user:delete'] }),
    item({ method: 'get', fullPath: '/api/tenants', summary: '租户列表', domain: 'platform', domainLabel: '平台', basePath: '/api/tenants', accessKind: 'platform', platformOnly: true }),
    item({ method: 'get', fullPath: '/api/member/profile', summary: '会员资料', domain: 'member', domainLabel: '会员', basePath: '/api/member', security: 'member-bearer', accessKind: null }),
  ],
  permissionLabels: { 'system:user:list': '查看用户', 'system:user:delete': '删除用户' },
};

function renderPage() {
  const qc = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={qc}>
      <PreferencesContext.Provider value={prefs}>
        <MemoryRouter initialEntries={['/system/api-catalog']}><ApiCatalogPage /></MemoryRouter>
      </PreferencesContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, client: qc };
}

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', apiCatalogContract.get.fullPath, catalog);
  recorder.on('GET', permissionMatrixContract.roles.fullPath, [
    { id: 1, name: '超级管理员', code: 'super_admin', status: 'enabled', tenantId: null, superAdmin: true, permissions: [] },
    { id: 2, name: '只读', code: 'viewer', status: 'enabled', tenantId: null, superAdmin: false, permissions: ['system:user:list'] },
  ]);
});

describe('catalog model', () => {
  it('gives every item a stable row key and partitions the stats exhaustively', () => {
    const rows = toCatalogRows(catalog);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    const stats = summarizeCatalog(rows);
    expect(stats).toEqual({ total: 6, permission: 2, authenticated: 1, platform: 1, public: 1, otherCredential: 1 });
  });

  it('filters by module / method / permission code / keyword on path', () => {
    const rows = toCatalogRows(catalog);
    const users = rows.filter((r) => matchesCatalogFilters(r, { ...EMPTY_FILTERS, domain: 'identity', method: 'delete', permission: 'system:user:delete' }));
    expect(users.map((r) => r.fullPath)).toEqual(['/api/users/{id}']);
    const byPath = rows.filter((r) => matchesCatalogFilters(r, { ...EMPTY_FILTERS, keyword: '/api/auth/login' }));
    expect(byPath.map((r) => r.fullPath)).toEqual(['/api/auth/login']);
    const other = rows.filter((r) => matchesCatalogFilters(r, { ...EMPTY_FILTERS, otherCredential: true }));
    expect(other.map((r) => r.fullPath)).toEqual(['/api/member/profile']);
  });
});

describe('ApiCatalogPage', () => {
  it('still downloads fresh catalog data when the active query is explicitly refreshed', async () => {
    const { client } = renderPage();
    await screen.findByText('共 6 个接口，由契约声明派生');
    recorder.on('GET', apiCatalogContract.get.fullPath, {
      ...catalog,
      items: [...catalog.items, item({ method: 'post', fullPath: '/api/auth/logout', summary: '退出登录', basePath: '/api/auth' })],
    });

    await act(async () => {
      await client.refetchQueries({ queryKey: apiCatalogKeys.catalog });
    });

    expect(await screen.findByText('共 7 个接口，由契约声明派生')).toBeTruthy();
    expect(screen.getByText('/api/auth/logout')).toBeTruthy();
    expect(recorder.countOf('GET', apiCatalogContract.get.fullPath)).toBe(2);
  });
});
