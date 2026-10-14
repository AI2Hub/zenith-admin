import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChatImageCache, warmChatImage } from './image-cache';

/** 可手动驱动 load / error 的 Image 替身 */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'auto';
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  decode = vi.fn(() => Promise.resolve());
  #src = '';
  constructor() { FakeImage.instances.push(this); }
  set src(value: string) { this.#src = value; }
  get src(): string { return this.#src; }
  succeed(naturalWidth = 800, naturalHeight = 600): void {
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.complete = true;
    this.onload?.();
  }
  fail(): void { this.onerror?.(); }
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal('Image', FakeImage);
  resetChatImageCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('warmChatImage', () => {
  it('解码成功后完成预热', async () => {
    const pending = warmChatImage('/a.png');
    expect(FakeImage.instances).toHaveLength(1);

    FakeImage.instances[0].succeed();
    await expect(pending).resolves.toBe(true);
  });

  it('加载失败返回 false', async () => {
    const pending = warmChatImage('/bad.png');
    FakeImage.instances[0].fail();
    await expect(pending).resolves.toBe(false);
  });

  it('同一 URL 的并发预热共享一次请求', async () => {
    const first = warmChatImage('/same.png');
    const second = warmChatImage('/same.png');
    expect(FakeImage.instances).toHaveLength(1);

    FakeImage.instances[0].succeed();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('不同 URL 各自预热', async () => {
    const a = warmChatImage('/a.png');
    const b = warmChatImage('/b.png');
    expect(FakeImage.instances.map((img) => img.src)).toEqual(['/a.png', '/b.png']);

    FakeImage.instances[1].succeed();
    await expect(b).resolves.toBe(true);
    FakeImage.instances[0].succeed();
    await a;
  });

  it('超时结束预热并清理事件监听', async () => {
    vi.useFakeTimers();
    const pending = warmChatImage('/slow.png');
    vi.advanceTimersByTime(5000);
    await expect(pending).resolves.toBe(false);

    FakeImage.instances[0].succeed();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeImage.instances).toHaveLength(1);
  });
});