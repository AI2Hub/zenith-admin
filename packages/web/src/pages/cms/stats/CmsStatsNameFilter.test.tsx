import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsStatsReportQuery } from '@/hooks/queries/cms-stats';
import CmsStatsNameFilter from './CmsStatsNameFilter';

const queries = vi.hoisted(() => [] as { query: CmsStatsReportQuery; enabled: boolean }[]);
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: { tablePageSize: 10 } }) }));
vi.mock('@/hooks/queries/cms-stats', () => ({ useCmsStatsReport: (query: CmsStatsReportQuery, enabled: boolean) => {
  queries.push({ query, enabled });
  return { isFetching: false, data: enabled ? { total: 260, list: query.keyword === '第250篇' ? [{ key: '250', label: '第250篇文化观察' }] : [{ key: String(query.page), label: `第${query.page}页` }] } : undefined };
} }));
vi.mock('@/components/search-filters', () => ({ FilterSelect: ({ onSearch, onDropdownVisibleChange, onChange, items, outerBottomSlot }: { onSearch: (value: string) => void; onDropdownVisibleChange: (value: boolean) => void; onChange: (value: number) => void; items: { label: string; value: number }[]; outerBottomSlot: ReactNode }) => <div><button onClick={() => onDropdownVisibleChange(true)}>打开名称筛选</button><input aria-label="搜索名称" onChange={(event) => onSearch(event.target.value)} />{items.map((item) => <button key={item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}{outerBottomSlot}</div> }));
beforeEach(() => { queries.length = 0; });
describe('CMS statistics remote name filter', () => {
  it('queries names beyond the shortcut preload and removes self-filtering scope', async () => {
    const changed = vi.fn();
    render(<CmsStatsNameFilter query={{ siteId: 7, contentId: 1, channelId: 2, releaseId: 3, author: 'A' }} dimension="content" placeholder="全部内容" initialOptions={[{ value: 1, label: '第一篇' }]} onChange={changed} />);
    fireEvent.click(screen.getByRole('button', { name: '打开名称筛选' }));
    fireEvent.change(screen.getByLabelText('搜索名称'), { target: { value: '第250篇' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '第250篇文化观察' })).toBeInTheDocument());
    const lookup = queries.findLast((item) => item.enabled && item.query.keyword === '第250篇')!;
    expect(lookup.query).toMatchObject({ siteId: 7, contentId: undefined, channelId: undefined, releaseId: undefined, author: undefined, dimension: 'content', page: 1, pageSize: 30 });
    fireEvent.click(screen.getByRole('button', { name: '第250篇文化观察' }));
    expect(changed).toHaveBeenCalledWith(250);
  });
});
