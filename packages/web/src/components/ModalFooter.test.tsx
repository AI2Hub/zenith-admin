import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@douyinfe/semi-ui';
import { ModalFooter } from './ModalFooter';

const row = (button: HTMLElement) => button.parentElement!.parentElement!;

describe('ModalFooter', () => {
  it('缺省只有取消 / 确认两个按钮并靠右对齐', () => {
    render(<ModalFooter onCancel={vi.fn()} onOk={vi.fn()} okText="保存" />);
    const cancel = screen.getByRole('button', { name: '取消' });
    const ok = screen.getByRole('button', { name: '保存' });
    expect(cancel.parentElement).toBe(ok.parentElement);
    expect(cancel.parentElement!.children).toHaveLength(2);
    expect(row(cancel).style.justifyContent).toBe('flex-end');
  });

  it('extraActions 是与取消 / 确认同组的第三个动作', () => {
    render(<ModalFooter onCancel={vi.fn()} onOk={vi.fn()} okText="保留副本并离开" extraActions={<Button type="danger" theme="light">直接离开（不保留副本）</Button>} />);
    const leave = screen.getByRole('button', { name: '直接离开（不保留副本）' });
    const cancel = screen.getByRole('button', { name: '取消' });
    const ok = screen.getByRole('button', { name: '保留副本并离开' });
    expect(leave.parentElement).toBe(cancel.parentElement);
    expect(ok.parentElement).toBe(cancel.parentElement);
    expect(cancel.parentElement!.children).toHaveLength(3);
    expect(row(cancel).style.justifyContent).toBe('flex-end');
  });

  it('extra 仍靠左，与右侧按钮组两端对齐', () => {
    render(<ModalFooter onCancel={vi.fn()} onOk={vi.fn()} extra={<Button>测试连接</Button>} />);
    const probe = screen.getByRole('button', { name: '测试连接' });
    const cancel = screen.getByRole('button', { name: '取消' });
    expect(probe.parentElement).not.toBe(cancel.parentElement);
    expect(row(probe)).toBe(row(cancel));
    expect(row(cancel).style.justifyContent).toBe('space-between');
  });
});
