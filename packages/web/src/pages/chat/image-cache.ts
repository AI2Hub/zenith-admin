/**
 * 会话图片的「已解码就绪」登记表。
 *
 * 浏览器按 URL 缓存解码结果：同一 URL 的另一个 <img> 挂载后可以直接成像，
 * 不必再走网络与解码。发送流程在消息落库前先 warmChatImage(url)，消息气泡
 * 首帧就能画出图片，避免「灰底 + 转圈 → 淡入」两段闪烁；反过来，气泡挂载
 * 尚未就绪的图片时也顺手预热一次，让虚拟列表来回滚动后再次露出时同样首帧成像。
 *
 * 这里只登记「浏览器已经拿到可绘制结果」，不持有字节：解码结果由浏览器按 URL
 * 复用，登记表本身保持常数级内存，超时条目按 TTL 与条数上限淘汰。
 */

/** 就绪记录有效期：超出后不再假定浏览器仍保留解码结果 */
const READY_TTL_MS = 10 * 60 * 1000;
/** 预热上限：网络异常时不让发送流程无限等待 */
const WARM_TIMEOUT_MS = 4000;
/** 就绪表条数上限，避免长会话无限增长 */
const READY_MAX_ENTRIES = 300;

/** url → 登记时刻（Map 保持插入序，末尾为最新，淘汰从头开始） */
const readyAt = new Map<string, number>();
/** 同一 URL 的并发预热共享同一个请求，避免重复下载与解码 */
const warming = new Map<string, Promise<boolean>>();

/** 登记一张图片已解码就绪（加载失败不登记） */
export function markChatImageReady(url: string | null | undefined): void {
  if (!url) return;
  readyAt.delete(url);
  readyAt.set(url, Date.now());
  while (readyAt.size > READY_MAX_ENTRIES) {
    const oldest = readyAt.keys().next();
    if (oldest.done) break;
    readyAt.delete(oldest.value);
  }
}

export function isChatImageReady(url: string | null | undefined): boolean {
  if (!url) return false;
  const at = readyAt.get(url);
  if (at === undefined) return false;
  if (Date.now() - at > READY_TTL_MS) {
    readyAt.delete(url);
    return false;
  }
  return true;
}

/**
 * 预热一张图片到「已解码可绘制」，返回是否成功。
 * 超时只结束等待、不放弃登记：迟到的解码成功同样会让后续挂载首帧成像。
 */
export function warmChatImage(url: string): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  if (isChatImageReady(url)) return Promise.resolve(true);
  const inflight = warming.get(url);
  if (inflight) return inflight;
  const task = loadAndDecode(url).finally(() => { warming.delete(url); });
  warming.set(url, task);
  return task;
}

/** 仅供测试重置模块级登记表 */
export function resetChatImageCache(): void {
  readyAt.clear();
  warming.clear();
}

function loadAndDecode(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const settle = (ok: boolean) => {
      if (ok) markChatImageReady(url);
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(ok);
    };
    // 先挂超时再看是否有 Image：settle 在 timer 初始化之后才可能被调用
    const timer = setTimeout(() => settle(false), WARM_TIMEOUT_MS);

    if (typeof Image === 'undefined') {
      settle(false);
      return;
    }
    let img: HTMLImageElement;
    try {
      img = new Image();
    } catch {
      settle(false);
      return;
    }
    img.decoding = 'async';
    img.onload = () => {
      // decode() 才代表「已解码可绘制」；load 事件只说明字节到位，
      // 大图还要再解码若干帧，气泡挂载时照样会闪。
      if (typeof img.decode !== 'function') { settle(true); return; }
      img.decode().then(() => settle(true), () => settle(img.naturalWidth > 0));
    };
    img.onerror = () => settle(false);
    img.src = url;
  });
}