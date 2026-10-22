import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchToolbar } from './SearchToolbar';
import { ListSearchToolbar } from './list-page/ListSearchToolbar';
import ExportButton from './ExportButton';
import { ClearLogsButtons } from './logs/ClearLogsControl';
import { ToolbarSlotContext } from './toolbar-slot-context';
import { PermissionContext } from '@/hooks/usePermission';
import type { Permission } from '@zenith/shared/core';

vi.mock('@/hooks/useExportJobRunner', () => ({
  useExportJobRunner: () => ({ runExport: vi.fn(), isPending: false, pendingFormat: null }),
}));

describe('SearchToolbar', () => {
  it('hides the mobile menu trigger when actions render nothing at runtime (permission-gated buttons)', () => {
    const gated = <ExportButton entity="demo" permission={'demo:export' as Permission} />;
    const denied = render(
      <PermissionContext.Provider value={[]}>
        <SearchToolbar primary={<span>P</span>} actions={gated} />
        <ListSearchToolbar keyword={<input placeholder="搜索" />} actions={gated} onSearch={() => {}} onReset={() => {}} />
      </PermissionContext.Provider>,
    );
    expect(denied.queryAllByRole('button', { name: '更多操作' })).toHaveLength(0);
    denied.unmount();

    const granted = render(
      <PermissionContext.Provider value={['demo:export']}>
        <SearchToolbar primary={<span>P</span>} actions={gated} />
        <ListSearchToolbar keyword={<input placeholder="搜索" />} actions={gated} onSearch={() => {}} onReset={() => {}} />
      </PermissionContext.Provider>,
    );
    expect(granted.getAllByRole('button', { name: '更多操作' })).toHaveLength(2);
  });
});

describe('ClearLogsButtons', () => {
  it('clears by retention days: main button uses one year, dropdown lists the other tiers', () => {
    const onClear = vi.fn();
    render(<ClearLogsButtons loading={false} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /清除日志/ }));
    expect(onClear).toHaveBeenCalledWith(365);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('flattens into one button per tier inside the mobile actions slot', () => {
    const onClear = vi.fn();
    render(
      <ToolbarSlotContext.Provider value="mobile-actions">
        <ClearLogsButtons loading={false} onClear={onClear} label="录屏" />
      </ToolbarSlotContext.Provider>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      '清除一年前的录屏',
      '清除六个月前的录屏',
      '清除三个月前的录屏',
      '清除一个月前的录屏',
    ]);
    fireEvent.click(buttons[3]);
    expect(onClear).toHaveBeenCalledWith(30);
  });
});
