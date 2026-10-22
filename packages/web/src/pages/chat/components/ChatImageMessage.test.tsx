import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChatImageCache } from '../image-cache';
import { ChatImageMessage } from './ChatImageMessage';

const SRC = 'https://cdn.example.com/a.png';
beforeEach(() => {
  resetChatImageCache();
});

describe('ChatImageMessage', () => {
  it('加载失败给出失败占位', () => {
    render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    fireEvent.error(screen.getByAltText('图'));
    expect(screen.getByText('图片加载失败')).toBeTruthy();
  });

  it('点击触发预览回调', () => {
    const onOpen = vi.fn();
    render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});