// 其余用例把 `Modal.confirm` mock 成记录配置再手动触发回调；这里真实渲染一次，
// 因为「直接离开」是自定义页脚里的第三个按钮，Semi 的命令式渲染与关闭都必须真的成立。
// 命令式渲染依赖入口注入的 react19-adapter（`main.tsx` 同样方式注入），否则 jsdom 里弹窗不渲染。
import '@douyinfe/semi-ui/react19-adapter';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCmsEditorRecovery } from './useCmsEditorRecovery';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 71 } }) }));

const key = 'cms-editor-recovery:71:3:new-article';
const draft = { values: { title: '未保存的新稿' }, body: '<p>正文修改</p>', albumImages: [], attachments: [] };
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/cms/contents/edit']}>{children}</MemoryRouter>;
// 关闭图标也是 button 但没有文案，按文案过滤后剩下的就是页脚动作。
const modalButtons = () => [...document.querySelectorAll('button')].map((button) => button.textContent ?? '').filter(Boolean);
// jsdom 不会触发 CSS 动画结束，弹窗不会真正卸载；「已开始关闭」以隐藏动画类为准。
const closing = () => document.querySelector('.semi-modal-content-animate-hide') !== null;
const clickModalButton = (text: string) => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent === text);
  if (!button) throw new Error(`弹窗上没有「${text}」按钮：${modalButtons().join(' / ')}`);
  button.click();
};
const openLeaveDialog = () => {
  const dirty = { current: true };
  const hook = renderHook(() => ({ recovery: useCmsEditorRecovery({ key: '3:new-article', dirty, getDraft: () => draft }), navigate: useNavigate(), location: useLocation() }), { wrapper });
  act(() => hook.result.current.navigate('/cms/contents'));
  return hook;
};

// 命令式弹窗挂在 document.body 上且慢于测试结束，逐个用例清干净，避免按钮累积。
beforeEach(() => { localStorage.removeItem(key); document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; });

describe('CMS 编辑离开弹窗（真实 Semi 渲染）', () => {
  it('offers continuing, keeping the copy, or leaving without it', () => {
    const hook = openLeaveDialog();
    expect(modalButtons()).toEqual(['直接离开', '继续编辑', '保留副本并离开']);
    // 三个动作必须在同一个右侧按钮组里：散到两端（`extra`）时「直接离开」离另两个选项很远，看起来不像一组选择。
    // 组宽超出页脚可用宽度会让按钮顶出弹窗内边距，所以标签长度也要克制（jsdom 没有布局，只能靠浏览器看宽度）。
    const buttons = [...document.querySelectorAll('button')].filter((button) => button.textContent);
    expect(new Set(buttons.map((button) => button.parentElement)).size).toBe(1);
    expect(buttons[0].parentElement!.parentElement!.style.justifyContent).toBe('flex-end');
    hook.unmount();
  });

  it('leaves immediately and drops the copy the dialog wrote', () => {
    const hook = openLeaveDialog();
    expect(localStorage.getItem(key)).not.toBeNull();
    act(() => clickModalButton('直接离开'));
    expect(hook.result.current.location.pathname).toBe('/cms/contents');
    expect(localStorage.getItem(key)).toBeNull();
    hook.unmount();
    // 卸载时的 persist 不得把刚丢弃的副本写回。
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('stays on the editor and keeps the copy when the user continues editing', () => {
    const hook = openLeaveDialog();
    act(() => clickModalButton('继续编辑'));
    expect(hook.result.current.location.pathname).toBe('/cms/contents/edit');
    expect(closing()).toBe(true);
    expect(localStorage.getItem(key)).not.toBeNull();
    hook.unmount();
  });
});
