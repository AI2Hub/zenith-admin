import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChatImageReady, markChatImageReady, resetChatImageCache, warmChatImage } from './image-cache';

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
  it('解码成功后登记为就绪', async () => {
    const pending = warmChatImage('/a.png');
    expect(FakeImage.instances).toHaveLength(1);
    expect(isChatImageReady('/a.png')).toBe(false);

    FakeImage.instances[0].succeed();
    await expect(pending).resolves.toBe(true);
    expect(isChatImageReady('/a.png')).toBe(true);
  });

  it('加载失败不登记就绪', async () => {
    const pending = warmChatImage('/bad.png');
    FakeImage.instances[0].fail();
    await expect(pending).resolves.toBe(false);
    expect(isChatImageReady('/bad.png')).toBe(false);
  });

  it('同一 URL 的并发预热共享一次请求', async () => {
    const first = warmChatImage('/same.png');
    const second = warmChatImage('/same.png');
    expect(FakeImage.instances).toHaveLength(1);

    FakeImage.instances[0].succeed();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('已就绪的图片直接复用，不再发起请求', async () => {
    markChatImageReady('/ready.png');
    await expect(warmChatImage('/ready.png')).resolves.toBe(true);
    expect(FakeImage.instances).toHaveLength(0);
  });

  it('不同 URL 各自预热', async () => {
    const a = warmChatImage('/a.png');
    const b = warmChatImage('/b.png');
    expect(FakeImage.instances.map((img) => img.src)).toEqual(['/a.png', '/b.png']);

    FakeImage.instances[1].succeed();
    await expect(b).resolves.toBe(true);
    expect(isChatImageReady('/b.png')).toBe(true);
    expect(isChatImageReady('/a.png')).toBe(false);
    FakeImage.instances[0].succeed();
    await a;
  });

  it('超时只结束等待，迟到的解码成功仍会登记就绪', async () => {
    vi.useFakeTimers();
    const pending = warmChatImage('/slow.png');
    vi.advanceTimersByTime(5000);
    await expect(pending).resolves.toBe(false);
    expect(isChatImageReady('/slow.png')).toBe(false);

    // 超时后到达的图片仍要让之后挂载的气泡首帧成像
    FakeImage.instances[0].succeed();
    await vi.advanceTimersByTimeAsync(0);
    expect(isChatImageReady('/slow.png')).toBe(true);
  });
});

describe('isChatImageReady', () => {
  it('忽略空 URL', () => {
    expect(isChatImageReady(null)).toBe(false);
    expect(isChatImageReady(undefined)).toBe(false);
    expect(isChatImageReady('')).toBe(false);
  });

  it('超过有效期后不再视为就绪', () => {
    vi.useFakeTimers();
    markChatImageReady('/old.png');
    expect(isChatImageReady('/old.png')).toBe(true);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(isChatImageReady('/old.png')).toBe(false);
  });
});