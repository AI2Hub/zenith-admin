import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChatImageCache } from '../image-cache';
import { ChatImageMessage } from './ChatImageMessage';

const SRC = 'https://cdn.example.com/a.png';
const PLACEHOLDER = '.chat-image-placeholder';

beforeEach(() => {
  resetChatImageCache();
});

describe('ChatImageMessage', () => {
  it('首帧直接渲染真实图片，不挂载 spinner、占位动画或淡入', () => {
    render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);

    const img = screen.getByAltText('图');
    expect(img.closest('span')).toBeTruthy();
    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    expect(img.style.opacity).toBe('');
    expect(img.style.transition).toBe('');
  });

  it('加载前后保持同一个固定画布尺寸', () => {
    const { container } = render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    const box = container.querySelector('button > span') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.height).toBe('120px');

    fireEvent.load(screen.getByAltText('图'));

    expect((container.querySelector('button > span') as HTMLElement).style.width).toBe('240px');
    expect((container.querySelector('button > span') as HTMLElement).style.height).toBe('120px');
  });

  it('按素材宽高比预留占位盒，与最终图等大', () => {
    const { container } = render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    const box = container.querySelector('button > span') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.height).toBe('120px');
  });

  it('缺宽高的老数据仍使用固定回退画布', () => {
    const { container } = render(<ChatImageMessage src={SRC} name="图" />);
    const box = container.querySelector('button > span') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.height).toBe('180px');
  });

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