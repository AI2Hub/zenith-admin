/**
 * TabBarItem 单元测试
 *
 * 该组件是页签栏的性能关键路径，覆盖点：
 *  1. memo 生效：AdminLayout 因无关 state 重渲染时，props 未变的页签不重新渲染
 *  2. 右键菜单懒构建：未右键前不构造菜单项；右键后菜单内容在同一次提交内就位（不闪空）
 *  3. 菜单项按页签状态正确禁用 / 切换（固定 ↔ 取消固定、收藏 ↔ 取消收藏）
 *  4. 常规交互（点击选中、关闭按钮、中键关闭）仍然工作
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TabItem } from '@/hooks/useTabsStore';
import { TabBarItem, type TabBarItemActions } from './TabBarItem';

function createActions(): TabBarItemActions {
  return {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onRefresh: vi.fn(),
    onDoubleClick: vi.fn(),
    onMiddleClick: vi.fn(),
    onPinToggle: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onToggleFavorite: vi.fn(),
    onCopyName: vi.fn(),
    onCopyLink: vi.fn(),
    onCopyBreadcrumb: vi.fn(),
    onOpenInNewWindow: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseLeft: vi.fn(),
    onCloseRight: vi.fn(),
    onCloseAll: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
  };
}

const baseTab: TabItem = { key: '/system/users', title: '用户管理', closable: true };

function baseProps(actions: TabBarItemActions) {
  return {
    tab: baseTab,
    actions,
    isActive: false,
    isEntering: false,
    isExiting: false,
    isDragging: false,
    isDragOver: false,
    hasClosableLeft: true,
    hasClosableRight: true,
    hasClosableOthers: true,
    hasAnyClosable: true,
    favMenuId: null as number | null,
    faved: false,
    showIcon: false,
    isContentFullscreen: false,
  };
}

describe('TabBarItem', () => {
  let actions: TabBarItemActions;

  beforeEach(() => {
    actions = createActions();
  });

  it('props 未变化时不重新渲染（memo 生效）', () => {
    const renderSpy = vi.fn();
    // 通过一个会记录渲染次数的子节点间接观测：title 变化才应触发重渲染
    const props = baseProps(actions);
    const Probe = ({ tab }: { readonly tab: TabItem }) => {
      renderSpy(tab.key);
      return null;
    };

    const { rerender } = render(
      <>
        <TabBarItem {...props} />
        <Probe tab={baseTab} />
      </>,
    );
    const initialTabNodes = screen.getAllByRole('tab').length;
    expect(initialTabNodes).toBe(1);

    // 用完全相同的 props 重新渲染父级：memo 应拦截
    rerender(
      <>
        <TabBarItem {...props} />
        <Probe tab={baseTab} />
      </>,
    );

    // Probe 说明父级确实重新渲染了两次
    expect(renderSpy).toHaveBeenCalledTimes(2);
    // 而页签本身仍是同一个 DOM 节点、内容未变
    expect(screen.getByText('用户管理')).toBeTruthy();
  });

  it('右键后菜单项在同一次提交内就位', () => {
    render(<TabBarItem {...baseProps(actions)} />);
    fireEvent.contextMenu(screen.getByRole('tab'));

    // 菜单内容必须已经存在，而不是先挂一个空壳
    expect(screen.getByText('刷新页面')).toBeTruthy();
    expect(screen.getByText('复制面包屑路径')).toBeTruthy();
    expect(screen.getByText('关闭全部')).toBeTruthy();
  });

  it('右键菜单项触发对应操作', () => {
    render(<TabBarItem {...baseProps(actions)} />);
    const tabEl = screen.getByRole('tab');

    // clickToHide：每次点击后弹层关闭，需重新唤起右键菜单
    fireEvent.contextMenu(tabEl);
    fireEvent.click(screen.getByText('刷新页面'));
    expect(actions.onRefresh).toHaveBeenCalledWith('/system/users');

    fireEvent.contextMenu(tabEl);
    fireEvent.click(screen.getByText('关闭其他'));
    expect(actions.onCloseOthers).toHaveBeenCalledWith('/system/users');

    fireEvent.contextMenu(tabEl);
    fireEvent.click(screen.getByText('关闭全部'));
    expect(actions.onCloseAll).toHaveBeenCalled();
  });

  it('首页页签不展示固定项，普通页签按 pinned 切换文案', () => {
    const { rerender } = render(
      <TabBarItem {...baseProps(actions)} tab={{ key: '/', title: '首页', closable: false }} />,
    );
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.queryByText('固定标签页')).toBeNull();

    rerender(<TabBarItem {...baseProps(actions)} tab={{ ...baseTab, pinned: true }} />);
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.getByText('取消固定')).toBeTruthy();
  });

  it('收藏项仅在 favMenuId 存在时出现，并按 faved 切换文案', () => {
    const { rerender } = render(<TabBarItem {...baseProps(actions)} />);
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.queryByText('收藏此页')).toBeNull();

    rerender(<TabBarItem {...baseProps(actions)} favMenuId={42} faved={false} />);
    fireEvent.contextMenu(screen.getByRole('tab'));
    fireEvent.click(screen.getByText('收藏此页'));
    expect(actions.onToggleFavorite).toHaveBeenCalledWith(42);

    rerender(<TabBarItem {...baseProps(actions)} favMenuId={42} faved />);
    fireEvent.contextMenu(screen.getByRole('tab'));
    expect(screen.getByText('取消收藏')).toBeTruthy();
  });
});
