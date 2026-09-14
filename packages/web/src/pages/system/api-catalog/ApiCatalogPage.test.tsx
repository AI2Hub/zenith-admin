import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { permissionMatrixContract } from '@zenith/shared/identity';
import { PreferencesContext, defaultPreferences, type PreferencesContextValue } from '@/hooks/usePreferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import { desktopToolbar } from '@/test-utils/toolbar';
import { catalogRows, matchesCatalogFilters, EMPTY_FILTERS, summarizeCatalog } from './catalog-model';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: () => true }) }));

import ApiCatalogPage from './ApiCatalogPage';

const prefs = { preferences: defaultPreferences } as unknown as PreferencesContextValue;

function renderPage(initialEntry = '/system/api-catalog') {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <PreferencesContext.Provider value={prefs}>
        <MemoryRouter initialEntries={[initialEntry]}><ApiCatalogPage /></MemoryRouter>
      </PreferencesContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', permissionMatrixContract.roles.fullPath, [
    { id: 1, name: '超级管理员', code: 'super_admin', status: 'enabled', tenantId: null, superAdmin: true, permissions: [] },
    { id: 2, name: '只读', code: 'viewer', status: 'enabled', tenantId: null, superAdmin: false, permissions: ['system:user:list'] },
  ]);
});

describe('catalog model', () => {
  it('derives every contract operation with a stable key and consistent stats', () => {
    const rows = catalogRows();
    expect(rows.length).toBeGreaterThan(2000);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    const stats = summarizeCatalog(rows);
    expect(stats.permission + stats.authenticated + stats.platform + stats.public + stats.otherCredential).toBe(stats.total);
  });

  it('filters by module / method / permission code / keyword on path', () => {
    const rows = catalogRows();
    const users = rows.filter((r) => matchesCatalogFilters(r, { ...EMPTY_FILTERS, domain: 'identity', method: 'delete', permission: 'system:user:delete' }));
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((r) => r.domain === 'identity' && r.method === 'delete' && r.permissions.includes('system:user:delete' as never))).toBe(true);
    const byPath = rows.filter((r) => matchesCatalogFilters(r, { ...EMPTY_FILTERS, keyword: '/api/auth/login' }));
    expect(byPath.some((r) => r.fullPath === '/api/auth/login')).toBe(true);
  });
});

describe('ApiCatalogPage', () => {
  it('renders the catalog stats, narrows by stat card and opens the operation sheet', async () => {
    const { container } = renderPage();
    const stats = summarizeCatalog(catalogRows());
    expect(screen.getByText('全部接口')).toBeTruthy();
    expect(screen.getByText(String(stats.total))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /公开接口/ }));
    expect(screen.getByText(`匹配 ${stats.public} / ${stats.total} 个接口`)).toBeTruthy();

    const keyword = desktopToolbar(container).getByPlaceholderText('搜索名称 / 路径 / 权限码（支持拼音）');
    fireEvent.change(keyword, { target: { value: '/api/auth/login' } });
    const pathCell = await screen.findByText('/api/auth/login');
    // 路径列可复制：单元格自身吞掉点击（避免选中文本触发行动作），点同一行的方法标签打开详情
    const row = pathCell.closest('tr, [role="row"]');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByText('POST'));
    await waitFor(() => expect(screen.getByText('契约组')).toBeTruthy());
    expect(screen.getByText('在 API 文档中查看')).toBeTruthy();
  });

  it('matrix tab judges every bearer operation for the selected role', async () => {
    const { container } = renderPage('/system/api-catalog?tab=matrix');
    expect(await screen.findByText('选择角色或用户后显示每个接口的判定结果')).toBeTruthy();
    await waitFor(() => expect(recorder.countOf('GET', permissionMatrixContract.roles.fullPath)).toBe(1));

    // 工具栏同时渲染桌面 / 移动两套控件，取桌面那份
    fireEvent.click(desktopToolbar(container).getByText('选择角色'));
    fireEvent.click(await screen.findByText('只读（viewer）'));
    await waitFor(() => expect(screen.getByText('无权限')).toBeTruthy());
    expect(screen.getByText('1 个权限码')).toBeTruthy();
    // 只读角色只有 system:user:list：可调用数 = 登录即可 + 引用该码的接口，其余无权限 / 仅平台
    const allowedCard = screen.getByRole('button', { name: /可调用/ });
    expect(Number(within(allowedCard).getByText(/^\d+$/).textContent)).toBeGreaterThan(0);
  });
});
