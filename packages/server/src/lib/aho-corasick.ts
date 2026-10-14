/**
 * Aho-Corasick 多模式字符串匹配（含 TTL 缓存包装）。
 *
 * CMS 敏感词过滤、易错词替换、编辑器词库检查三处都要「一次扫描命中一批词」，
 * 此前各自复制了一份自动机实现（构建 + fail 指针 + 扫描），任何一处修边界都会
 * 与另外两处静默分叉。此处收敛为一份泛型实现，载荷类型由调用方决定。
 */

/** 自动机节点；`hits` 为「以该节点结尾的全部模式载荷」（已并入 fail 链上的命中） */
interface AcNode<T> {
  children: Map<string, AcNode<T>>;
  fail: AcNode<T> | null;
  hits: T[];
}

/** 一次命中：`[start, end)` 为在**码点数组**上的区间（非 UTF-16 下标） */
export interface AcMatch<T> {
  start: number;
  end: number;
  payload: T;
}

export interface AcPattern<T> {
  word: string;
  /** 命中时回传给调用方的载荷 */
  payload: T;
}

/** 已构建的自动机；空词库时 `isEmpty` 为 true，调用方可直接短路 */
export class AhoCorasick<T> {
  private readonly root: AcNode<T>;

  constructor(patterns: readonly AcPattern<T>[]) {
    const root: AcNode<T> = { children: new Map(), fail: null, hits: [] };
    for (const { word, payload } of patterns) {
      if (!word) continue;
      let node = root;
      for (const ch of word) {
        let next = node.children.get(ch);
        if (!next) {
          next = { children: new Map(), fail: null, hits: [] };
          node.children.set(ch, next);
        }
        node = next;
      }
      node.hits.push(payload);
    }
    // BFS 构建 fail 指针，并把 fail 节点的命中并入当前节点（扫描时无需回溯 fail 链）
    const queue: AcNode<T>[] = [];
    for (const child of root.children.values()) {
      child.fail = root;
      queue.push(child);
    }
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const [ch, child] of node.children) {
        let fail = node.fail;
        while (fail && !fail.children.has(ch)) fail = fail.fail;
        child.fail = fail?.children.get(ch) ?? root;
        child.hits.push(...child.fail.hits);
        queue.push(child);
      }
    }
    this.root = root;
  }

  get isEmpty(): boolean {
    return this.root.children.size === 0;
  }

  /**
   * 单次扫描文本，按命中顺序回调；`length` 为模式词的码点长度，
   * 用于还原命中区间。回调返回 `false` 可提前终止扫描。
   */
  scan(chars: readonly string[], onHit: (payload: T, endIndex: number) => boolean | void): void {
    if (this.isEmpty) return;
    let node = this.root;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      while (node !== this.root && !node.children.has(ch)) node = node.fail ?? this.root;
      node = node.children.get(ch) ?? this.root;
      for (const payload of node.hits) {
        if (onHit(payload, i) === false) return;
      }
    }
  }
}

/** 把文本切成码点数组（保证 emoji / 生僻字按单字符参与匹配与切片） */
export function toCodePoints(text: string): string[] {
  return [...text];
}

/**
 * 按「起点升序、长词优先」排序后剔除重叠区间，返回可直接用于切片替换的命中序列。
 */
export function dedupeOverlaps<T>(matches: AcMatch<T>[]): AcMatch<T>[] {
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const applied: AcMatch<T>[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    applied.push(m);
    cursor = m.end;
  }
  return applied;
}

/**
 * 按不重叠命中批量替换文本。`replacer` 返回替换文本（返回空串即删除命中词）。
 */
export function applyReplacements<T>(
  chars: readonly string[],
  matches: AcMatch<T>[],
  replacer: (payload: T) => string,
): string {
  let out = '';
  let cursor = 0;
  for (const m of dedupeOverlaps(matches)) {
    out += chars.slice(cursor, m.start).join('') + replacer(m.payload);
    cursor = m.end;
  }
  return out + chars.slice(cursor).join('');
}

/**
 * TTL 内存缓存：词库类数据「读多写少 + 允许秒级陈旧」。
 *
 * `invalidate()` 供写路径（增删改词）调用，让下次读取立即重建。
 */
export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number) {
  let cache: { value: T; loadedAt: number } | null = null;
  let inflight: Promise<T> | null = null;

  return {
    async get(): Promise<T> {
      if (cache && Date.now() - cache.loadedAt < ttlMs) return cache.value;
      // 并发请求共享同一次加载，避免缓存失效瞬间的重复查库
      inflight ??= load()
        .then((value) => {
          cache = { value, loadedAt: Date.now() };
          return value;
        })
        .finally(() => { inflight = null; });
      return inflight;
    },
    invalidate(): void {
      cache = null;
    },
  };
}
