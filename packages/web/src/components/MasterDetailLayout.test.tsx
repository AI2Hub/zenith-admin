import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDetailLayout } from './MasterDetailLayout';

describe('MasterDetailLayout side switching', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('supports controlled side changes', () => {
    const onSideChange = vi.fn();
    render(
      <MasterDetailLayout
        side="left"
        onSideChange={onSideChange}
        master={<MasterDetailLayout.Header>列表</MasterDetailLayout.Header>}
        detail={<div>详情</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '将侧栏移到右侧' }));
    expect(onSideChange).toHaveBeenCalledWith('right');
  });
});
