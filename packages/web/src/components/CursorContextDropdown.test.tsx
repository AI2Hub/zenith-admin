import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockDropdownProps {
  readonly children?: ReactNode;
  readonly render?: ReactNode;
  readonly visible?: boolean;
  readonly trigger?: string;
  readonly position?: string;
  readonly autoAdjustOverflow?: boolean;
  readonly clickToHide?: boolean;
  readonly closeOnEsc?: boolean;
  readonly rePosKey?: string | number;
  readonly getPopupContainer?: () => HTMLElement;
  readonly onClickOutSide?: () => void;
  readonly onVisibleChange?: (visible: boolean) => void;
}

const dropdownState = vi.hoisted(() => ({
  calls: [] as MockDropdownProps[],
}));

vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@douyinfe/semi-ui')>();
  const React = await import('react');

  const MockDropdown = (props: MockDropdownProps) => {
    dropdownState.calls.push(props);
    return React.createElement(
      React.Fragment,
      null,
      props.children,
      props.visible ? props.render : null,
    );
  };

  return { ...actual, Dropdown: MockDropdown };
});

import { CursorContextDropdown } from './CursorContextDropdown';

function latestDropdownProps(): MockDropdownProps {
  const props = dropdownState.calls.at(-1);
  if (!props) throw new Error('dropdown was not rendered');
  return props;
}

describe('CursorContextDropdown', () => {
  beforeEach(() => {
    dropdownState.calls.length = 0;
  });

  it('closes once when Semi emits overlapping close notifications', () => {
    const onClose = vi.fn();
    render(
      <CursorContextDropdown
        point={{ x: 10, y: 20 }}
        contextKey="file:1"
        render={<div role="menu">菜单</div>}
        onClose={onClose}
      />,
    );
    const props = latestDropdownProps();

    act(() => props.onVisibleChange?.(true));
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      props.onClickOutSide?.();
      props.onVisibleChange?.(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
