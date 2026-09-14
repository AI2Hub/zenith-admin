/**
 * pinyin-pro 异步加载封装：把 ~290KB 的拼音词典移出首屏关键路径。
 *
 * 未就绪时 pinyinMatch 返回 null 并自动触发后台加载；
 * 所有调用方均需（且现均已）叠加普通子串匹配兜底，因此加载完成前仅拼音搜索暂不可用。
 * 需要在词典就绪后刷新结果的组件用 `hooks/usePinyinReady`。
 */
type MatchFn = typeof import('pinyin-pro').match;
type MatchOptions = NonNullable<Parameters<MatchFn>[2]>;

let matchFn: MatchFn | null = null;
let loadPromise: Promise<void> | null = null;
const readyListeners = new Set<() => void>();

/** 触发（幂等）pinyin-pro 动态加载；可在空闲时机预热 */
export function ensurePinyin(): Promise<void> {
  loadPromise ??= import('pinyin-pro').then((m) => {
    matchFn = m.match;
    readyListeners.forEach((notify) => notify());
  });
  return loadPromise;
}

export function isPinyinReady(): boolean {
  return matchFn !== null;
}

/** 词典就绪时通知（已就绪则不再回调）；返回取消订阅函数。订阅即触发加载 */
export function subscribePinyinReady(listener: () => void): () => void {
  readyListeners.add(listener);
  void ensurePinyin();
  return () => { readyListeners.delete(listener); };
}

/** 与 pinyin-pro 的 match 同签名；词典未就绪时返回 null 并触发加载 */
export function pinyinMatch(...args: Parameters<MatchFn>): ReturnType<MatchFn> | null {
  if (!matchFn) {
    void ensurePinyin();
    return null;
  }
  return matchFn(...args);
}

/**
 * 搜索框通用匹配：大小写不敏感的子串命中，或拼音命中（默认 `start`：每个字的拼音从开头匹配、可从任意字起，
 * 「dhwb」「danhang」「wb」都能命中「单行文本」）。菜单搜索、偏好设置、表单设计器搜索共用同一口径。
 * 空关键字视为命中；词典未就绪时只按子串匹配。
 */
export function textMatches(text: string, query: string, precision: MatchOptions['precision'] = 'start'): boolean {
  const q = query.trim();
  if (!q) return true;
  if (text.toLowerCase().includes(q.toLowerCase())) return true;
  return pinyinMatch(text, q, { precision }) !== null;
}
