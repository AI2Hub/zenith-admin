import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@zenith/shared/chat';
import SemanticStatus from './SemanticStatus';
import { CardMessage } from '@/pages/chat/components/CardMessage';
import { markCardDoneLocal } from '@/pages/chat/utils-state';

function message(status: 'approved' | 'rejected' | 'agreed' | 'declined'): ChatMessage {
  return { id: 1, type: 'card', extra: { card: { title: '测试通知', status: 'done', semanticStatus: status } } } as ChatMessage;
}

describe('shared semantic status presentation', () => {
  it('uses the same rejected label with danger tone in both forms', () => {
    render(<><SemanticStatus status="rejected" /><CardMessage msg={message('rejected')} /></>);
    expect(screen.getAllByText('已驳回')).toHaveLength(2);
    expect(screen.getAllByText('已驳回')[1]).toHaveStyle({ color: 'var(--semi-color-danger)' });
    expect(screen.queryByText('错误')).not.toBeInTheDocument();
  });
  it('does not turn a personal agreement into process approval', () => {
    const [updated] = markCardDoneLocal(1, 'agreed')([message('approved')]);
    render(<CardMessage msg={updated} />);
    expect(screen.getByText('已同意')).toBeInTheDocument();
    expect(screen.queryByText('已通过')).not.toBeInTheDocument();
  });
  it('renders personal refusal with danger tone instead of a green success indicator', () => {
    render(<CardMessage msg={message('declined')} />);
    expect(screen.getByText('已拒绝')).toHaveStyle({ color: 'var(--semi-color-danger)' });
  });
});
