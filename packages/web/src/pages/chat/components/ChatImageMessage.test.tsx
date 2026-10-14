import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markChatImageReady, resetChatImageCache } from '../image-cache';
import { ChatImageMessage } from './ChatImageMessage';

const SRC = 'https://cdn.example.com/a.png';
const PLACEHOLDER = '.chat-image-placeholder';

beforeEach(() => {
  resetChatImageCache();
});

describe('ChatImageMessage', () => {
  it('已就绪的图片首帧不渲染占位，也不做淡入', () => {
    markChatImageReady(SRC);
    render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);

    const img = screen.getByAltText('图');
    // 预热到「可绘制」后，灰底占位与透明度过渡都是闪烁源，两者都不应出现
    expect(img.closest('span')).toBeTruthy();
    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    expect(img.style.opacity).toBe('');
    expect(img.style.transition).toBe('');
  });

  it('未就绪时先占位，加载完成后占位消失', () => {
    const { unmount } = render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    expect(document.querySelector(PLACEHOLDER)).not.toBeNull();

    fireEvent.load(screen.getByAltText('图'));

    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    // 加载过的图片被登记就绪：虚拟列表滚走再回来时首帧即可成像
    unmount();
    render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    expect(document.querySelector(PLACEHOLDER)).toBeNull();
  });

  it('按素材宽高比预留占位盒，与最终图等大', () => {
    const { container } = render(<ChatImageMessage src={SRC} name="图" width={1200} height={600} />);
    const box = container.querySelector('button > span') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.height).toBe('120px');
  });

  it('缺宽高的老数据先给默认占位盒', () => {
    const { container } = render(<ChatImageMessage src={SRC} name="图" />);
    const box = container.querySelector('button > span') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.minHeight).toBe('120px');
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