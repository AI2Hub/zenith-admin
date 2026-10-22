import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@douyinfe/semi-ui', () => {
  type Item = { key: string | number; label: ReactNode; color?: string };
  type TagGroupItem = { tagKey: string | number; children: ReactNode; color?: string };
  type OverflowListProps = {
    items: Item[];
    visibleItemRenderer: (item: Item) => ReactNode;
    overflowRenderer: (items: Item[]) => ReactNode;
  };

  function OverflowList({ items, visibleItemRenderer, overflowRenderer }: OverflowListProps) {
    return (
      <div>
        {items.slice(0, 1).map(visibleItemRenderer)}
        {overflowRenderer(items.slice(1))}
      </div>
    );
  }

  function Popover({ children, content }: { children: ReactNode; content: ReactNode }) {
    return <div>{children}{content}</div>;
  }

  function Space({ children }: { children: ReactNode }) {
    return <div>{children}</div>;
  }

  function Tag({ children, color }: { children: ReactNode; color?: string }) {
    return <span data-color={color ?? ''}>{children}</span>;
  }

  function TagGroup({ maxTagCount, tagList }: { maxTagCount: number; tagList: TagGroupItem[] }) {
    return (
      <div data-max-tag-count={maxTagCount}>
        {tagList.slice(0, maxTagCount).map((item) => (
          <Tag key={item.tagKey} color={item.color}>{item.children}</Tag>
        ))}
        {tagList.length > maxTagCount ? <span>+{tagList.length - maxTagCount}</span> : null}
      </div>
    );
  }

  return { OverflowList, Popover, Space, Tag, TagGroup };
});

import OverflowTagList from './OverflowTagList';

const ITEMS = [
  { key: 'role-1', label: '管理员' },
  { key: 'role-2', label: '审核员' },
];

describe('OverflowTagList', () => {
  it('supports keyboard activation when the container is clickable', () => {
    const onClick = vi.fn();
    render(<OverflowTagList items={ITEMS} contentWidth={228} onClick={onClick} />);

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
