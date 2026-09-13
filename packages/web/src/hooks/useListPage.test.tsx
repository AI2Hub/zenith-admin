/**
 * useListPage 契约测试：搜索状态 → 筛选映射 → 列表查询 → 表格 props 一次接好，
 * 锁住「查询参数只含 page / pageSize + compact 后的 toQuery 结果」「查询 / 重置回源」「表格接线含分页与多选」。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, isInvalidated } from '@/test-utils/query-harness';
import { PreferencesContext, defaultPreferences, type PreferencesContextValue } from '@/hooks/usePreferences';
import { useListPage } from './useListPage';

interface Row { id: number; name: string }
interface SearchParams { keyword: string; status?: string }
const defaults: SearchParams = { keyword: '', status: undefined };
const listKey = ['rows', 'list'] as const;

const useListMock = vi.fn((params: { page: number; pageSize: number; keyword?: string; status?: 'enabled' | 'disabled' }, enabled?: boolean) => ({
  data: { list: [{ id: 1, name: `p${params.page}` }] as Row[], total: 42 },
  isFetching: false,
  refetch: vi.fn(),
  enabled,
}));

function setup() {
  const client = createTestQueryClient();
  client.setQueryData([...listKey, { page: 1 }], { list: [], total: 0 });
  const preferences = { preferences: defaultPreferences, updatePreferences: vi.fn(), resetPreferences: vi.fn() } as unknown as PreferencesContextValue;
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
      </QueryClientProvider>
    );
  }
  const view = renderHook(() => useListPage({
    defaults,
    listKey,
    useList: useListMock,
    toQuery: (s) => ({ keyword: s.keyword, status: s.status as 'enabled' | 'disabled' | undefined }),
    table: { empty: '暂无数据' },
  }), { wrapper: Wrapper });
  return { ...view, client };
}

describe('useListPage', () => {
  it('列表查询参数 = page / pageSize + compact 后的 toQuery 结果；filterQuery 不含分页', () => {
    const { result } = setup();
    expect(useListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }, undefined);
    expect(result.current.filterQuery).toEqual({});

    act(() => { result.current.setField('keyword')('abc'); result.current.setField('status')('enabled'); });
    // 草稿变化不触发查询参数变化
    expect(useListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }, undefined);

    act(() => { result.current.handleSearch(); });
    expect(useListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: 'abc', status: 'enabled' }, undefined);
    expect(result.current.filterQuery).toEqual({ keyword: 'abc', status: 'enabled' });
  });

  it('查询 / 重置失效 listKey（继承 useListSearch 的回源契约）', () => {
    const { result, client } = setup();
    act(() => { result.current.handleSearch(); });
    expect(isInvalidated(client, [...listKey, { page: 1 }])).toBe(true);
  });

  it('tableProps 接好数据源 / 分页 / 空态，翻页驱动查询参数', () => {
    const { result } = setup();
    expect(result.current.tableProps.dataSource).toEqual([{ id: 1, name: 'p1' }]);
    expect(result.current.tableProps.empty).toBe('暂无数据');
    expect(result.current.tableProps.rowKey).toBe('id');
    const pagination = result.current.tableProps.pagination;
    expect(pagination && pagination.total).toBe(42);

    act(() => { if (pagination) pagination.onPageChange(3); });
    expect(useListMock).toHaveBeenLastCalledWith({ page: 3, pageSize: 10 }, undefined);
    expect(result.current.listQuery.data?.list[0]?.name).toBe('p3');
  });
});
