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
  it('renders the catalog stats, narrows by stat card, and filters only after 查询 is clicked', async () => {
    const { container } = renderPage();
    const stats = summarizeCatalog(catalogRows());
    expect(screen.getByText('全部接口')).toBeTruthy();
    expect(screen.getByText(String(stats.total))).toBeTruthy();

    // 统计卡即筛选：立即提交
    fireEvent.click(screen.getByRole('button', { name: /公开接口/ }));
    expect(screen.getByText(`匹配 ${stats.public} / ${stats.total} 个接口`)).toBeTruthy();

    // 关键字只进草稿：未点「查询」前结果不变
    const toolbar = desktopToolbar(container);
    fireEvent.change(toolbar.getByPlaceholderText('搜索名称 / 路径 / 权限码（支持拼音）'), { target: { value: '/api/auth/login' } });
    expect(screen.getByText(`匹配 ${stats.public} / ${stats.total} 个接口`)).toBeTruthy();
    fireEvent.click(toolbar.getByText('查询'));
    expect(screen.getByText(`匹配 1 / ${stats.total} 个接口`)).toBeTruthy();

    const pathCell = await screen.findByText('/api/auth/login');
    // 路径列可复制：单元格自身吞掉点击（避免选中文本触发行动作），点同一行的方法标签打开详情
    const row = pathCell.closest('tr, [role="row"]');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByText('POST'));
    await waitFor(() => expect(screen.getByText('契约组')).toBeTruthy());
    expect(screen.getByText('在 API 文档中查看')).toBeTruthy();

    // 重置回到全量
    fireEvent.click(toolbar.getByText('重置'));
    expect(screen.getByText(`共 ${stats.total} 个接口，由契约声明实时派生`)).toBeTruthy();
  });

  it('matrix tab lists only the callable operations of the selected role by default and can switch to denied', async () => {
    renderPage('/system/api-catalog?tab=matrix');
    expect(await screen.findByText('选择角色或用户后，默认只列出它可调用的接口')).toBeTruthy();
    await waitFor(() => expect(recorder.countOf('GET', permissionMatrixContract.roles.fullPath)).toBe(1));

    fireEvent.click(screen.getByText('选择角色'));
    fireEvent.click(await screen.findByText('只读（viewer）'));
    await waitFor(() => expect(screen.getByText('持有 1 个权限码')).toBeTruthy());

    // 默认只看「可调用」：说明文字与统计卡选中态一致，表内判定标签全部是可调用
    const allowedCard = screen.getByRole('button', { name: /可调用/ });
    expect(allowedCard.getAttribute('aria-pressed')).toBe('true');
    const allowed = Number(within(allowedCard).getByText(/^\d+$/).textContent);
    expect(allowed).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^可调用 ${allowed} / \\d+ 个后台接口$`))).toBeTruthy();
    expect(screen.queryAllByText('无权限').filter((el) => el.closest('td, [role="gridcell"]'))).toHaveLength(0);

    // 切到「无权限」
    fireEvent.click(screen.getByRole('button', { name: /无权限/ }));
    const deniedCard = screen.getByRole('button', { name: /无权限/ });
    expect(deniedCard.getAttribute('aria-pressed')).toBe('true');
    const denied = Number(within(deniedCard).getByText(/^\d+$/).textContent);
    expect(screen.getByText(new RegExp(`^无权限 ${denied} / \\d+ 个后台接口$`))).toBeTruthy();
  });
});
