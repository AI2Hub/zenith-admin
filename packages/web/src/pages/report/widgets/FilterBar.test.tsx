import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportFilter } from '@zenith/shared';
import { FilterBar } from './FilterBar';

vi.mock('@/hooks/queries/report-designer', () => ({
  useReportFilterDynamicOptions: () => ({}),
}));

const filters: ReportFilter[] = [
  { id: 'keyword', label: '关键词', type: 'input' },
  {
    id: 'region',
    label: '区域',
    type: 'select',
    optionSource: { kind: 'static', options: [{ value: 'east', label: '华东' }] },
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FilterBar compact mode', () => {
  it('uses a bottom drawer with full-width draft controls and reset/apply actions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onChange = vi.fn();
    render(
      <FilterBar
        compact
        filters={filters}
        values={{ keyword: '旧值', region: null }}
        resetValues={{ keyword: '', region: null }}
        onChange={onChange}
        onApply={onApply}
        disableDynamicOptions
      />,
    );

    expect(document.body.contains(screen.getByRole('button', { name: /筛选条件，已启用 1 项/ }))).toBe(true);
    await user.click(screen.getByRole('button', { name: /筛选条件/ }));
    const input = await screen.findByPlaceholderText('关键词');
    expect((input as HTMLInputElement).value).toBe('旧值');

    await user.click(screen.getByRole('button', { name: '重置' }));
    expect((input as HTMLInputElement).value).toBe('');
    await user.type(input, '新值');
    await user.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ keyword: '新值', region: null }));
    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.querySelector('.report-filter-sheet')).not.toBeNull();
  });
});
