/**
 * 发送图片前的并发预热器。
 *
 * 预热只负责尽早触发网络读取和解码，不把“曾经解码过”当成永久状态：浏览器
 * 可以随时回收 decoded image，真正是否可显示仍由消息里的 img 自己确认。这样
 * 不会因为应用级登记表过期或与浏览器缓存脱节而跳过稳定占位。
 */

/** 网络异常时不让发送流程无限等待 */
const WARM_TIMEOUT_MS = 4000;
/** 正式消息挂载后继续保留本地预览，直到远端图片完成交接 */
const HANDOFF_TTL_MS = 30_000;
/** 同一 URL 的并发预热共享一次请求 */
const warming = new Map<string, Promise<boolean>>();
const handoffs = new Map<string, { previewUrl: string; timer: ReturnType<typeof setTimeout> }>();

export function registerChatImageHandoff(remoteUrl: string, previewUrl: string): void {
  if (!remoteUrl || !previewUrl) return;
  releaseChatImageHandoff(remoteUrl);
  const timer = setTimeout(() => releaseChatImageHandoff(remoteUrl), HANDOFF_TTL_MS);
  handoffs.set(remoteUrl, { previewUrl, timer });
}

export function getChatImageHandoff(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  return handoffs.get(remoteUrl)?.previewUrl ?? null;
}

export function releaseChatImageHandoff(remoteUrl: string | null | undefined): void {
  if (!remoteUrl) return;
  const handoff = handoffs.get(remoteUrl);
  if (!handoff) return;
  clearTimeout(handoff.timer);
  URL.revokeObjectURL(handoff.previewUrl);
  handoffs.delete(remoteUrl);
}

export function warmChatImage(url: string): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  const inflight = warming.get(url);
  if (inflight) return inflight;

  const task = loadAndDecode(url);
  warming.set(url, task);
  void task.finally(() => {
    if (warming.get(url) === task) warming.delete(url);
  });
  return task;
}

/** 仅供测试重置模块级预热请求与图片交接 */
export function resetChatImageCache(): void {
  warming.clear();
  for (const remoteUrl of handoffs.keys()) releaseChatImageHandoff(remoteUrl);
}

function loadAndDecode(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let img: HTMLImageElement | null = null;
    let settled = false;
    const timer = setTimeout(() => settle(false), WARM_TIMEOUT_MS);

    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
      resolve(ok);
    };

    if (typeof Image === 'undefined') {
      settle(false);
      return;
    }
    try {
      img = new Image();
    } catch {
      settle(false);
      return;
    }
    img.decoding = 'async';
    img.onload = () => {
      if (!img || typeof img.decode !== 'function') {
        settle(true);
        return;
      }
      img.decode().then(() => settle(true), () => settle(img?.naturalWidth > 0));
    };
    img.onerror = () => settle(false);
    img.src = url;
  });
}