import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DictTag from './DictTag';
import { useDictItems } from '@/hooks/useDictItems';

// Mock the hook
vi.mock('@/hooks/useDictItems', () => ({
  useDictItems: vi.fn(),
}));

describe('DictTag', () => {
  it('should render fallback dash when value is null', () => {
    vi.mocked(useDictItems).mockReturnValue({ items: [], options: [], loading: false, getLabel: (v: string) => v, getColor: () => undefined });
    const { container } = render(<DictTag dictCode="test" value={null} />);
    expect(container.textContent).toBe('—');
  });

  it('should render dictionary label when value is found', () => {
    vi.mocked(useDictItems).mockReturnValue({
      items: [{ id: 1, dictId: 1, value: 'yes', label: '是', color: 'green', sort: 1, status: 'enabled', createdAt: '', updatedAt: '' }],
      options: [{ value: 'yes', label: '是' }],
      loading: false,
      getLabel: () => '是',
      getColor: () => 'green',
    });
    render(<DictTag dictCode="test" value="yes" />);
    expect(screen.getByText('是')).toBeTruthy();
  });

  it('should render original value when value is not found and no fallback provided', () => {
    vi.mocked(useDictItems).mockReturnValue({ items: [], options: [], loading: false, getLabel: (v: string) => v, getColor: () => undefined });
    render(<DictTag dictCode="test" value="unknown" />);
    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('should render fallback text when value is not found and fallback is provided', () => {
    vi.mocked(useDictItems).mockReturnValue({ items: [], options: [], loading: false, getLabel: (v: string) => v, getColor: () => undefined });
    render(<DictTag dictCode="test" value="unknown" fallback="未知" />);
    expect(screen.getByText('未知')).toBeTruthy();
  });
});
