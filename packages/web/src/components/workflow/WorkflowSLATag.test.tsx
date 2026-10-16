import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkflowSLATag from './WorkflowSLATag';

describe('WorkflowSLATag', () => {
  it('未配置 SLA 时不渲染任何占位', () => {
    const { container } = render(<WorkflowSLATag />);
    expect(container).toBeEmptyDOMElement();
  });

  it('level 为 none 或缺少剩余时长时同样不渲染', () => {
    const { container } = render(<WorkflowSLATag level="none" overdueSec={3600} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('已超时按剩余时长给出人类可读文案', () => {
    render(<WorkflowSLATag level="overdue" overdueSec={7200} deadline="2026-10-11 10:00:00" />);
    expect(screen.getByText('已超时 2 小时')).toBeInTheDocument();
  });
});
