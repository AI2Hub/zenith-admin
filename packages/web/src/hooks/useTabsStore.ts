import { useState, useCallback, useRef, useEffect } from 'react';
import { TABS_STORAGE_KEY } from '@zenith/shared';

export interface TabItem {
  key: string;
  title: string;
  closable: boolean;
  pinned?: boolean;
  lastUsedAt?: number;
}

const HOME_TAB: TabItem = { key: '/', title: '首页', closable: false };

function readPersistedTabs(): { tabs: TabItem[]; activeKey: string } | null {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabs: TabItem[]; activeKey: string };
    if (!Array.isArray(parsed.tabs) || !parsed.tabs.length) return null;
    const hasHome = parsed.tabs.some((t) => t.key === '/');
    const tabs = hasHome ? parsed.tabs : [HOME_TAB, ...parsed.tabs];
    const activeKey = typeof parsed.activeKey === 'string' ? parsed.activeKey : '/';
    return { tabs, activeKey };
  } catch {
    return null;
  }
}

/** 排序：home → pinned → regular */
function sortTabs(tabs: TabItem[]): TabItem[] {
  const home = tabs.filter((t) => t.key === '/');
  const pinned = tabs.filter((t) => t.pinned && t.key !== '/');
  const regular = tabs.filter((t) => !t.pinned && t.key !== '/');
  return [...home, ...pinned, ...regular];
}

export function useTabsStore(
  maxCount: number = 20,
  onEvict?: (evicted: TabItem[]) => void,
  keepTabs: boolean = false,
  evictPolicy: 'fifo' | 'lru' = 'fifo',
) {
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    if (!keepTabs) return [HOME_TAB];
    return readPersistedTabs()?.tabs ?? [HOME_TAB];
  });
  const [activeKey, setActiveKey] = useState<string>(() => {
    if (!keepTabs) return '/';
    return readPersistedTabs()?.activeKey ?? '/';
  });

  // 我们使用一个 ref 来在回调中获取最新的状态，以决定要返回的 nextActive
  const stateRef = useRef({ tabs, activeKey });
  useEffect(() => {
    stateRef.current = { tabs, activeKey };
  }, [tabs, activeKey]);

  // 用 ref 存 onEvict，避免将其加入 useCallback 依赖
  const onEvictRef = useRef(onEvict);
  useEffect(() => { onEvictRef.current = onEvict; }, [onEvict]);

  // 持久化标签页到 localStorage
  useEffect(() => {
    if (keepTabs) {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({ tabs, activeKey }));
    } else {
      localStorage.removeItem(TABS_STORAGE_KEY);
    }
  }, [tabs, activeKey, keepTabs]);

  // 用 ref 存 evictPolicy，避免加入 useCallback 依赖
  const evictPolicyRef = useRef(evictPolicy);
  useEffect(() => { evictPolicyRef.current = evictPolicy; }, [evictPolicy]);

  // 选出要驱逐的标签页索引
  function pickEvictIdx(arr: TabItem[]): number {
    const closables = arr.map((t, i) => ({ i, t })).filter(({ t }) => t.closable);
    if (closables.length === 0) return -1;
    if (evictPolicyRef.current === 'lru') {
      // LRU：选 lastUsedAt 最小（最久未使用）
      closables.sort((a, b) => (a.t.lastUsedAt ?? 0) - (b.t.lastUsedAt ?? 0));
      return closables[0].i;
    }
    // FIFO：选数组中第一个可关闭的
    return closables[0].i;
  }

  const addTab = useCallback((key: string, title: string) => {
    // 使用 stateRef 读取最新状态，以便在超限时调用 onEvict 回调
    const prev = stateRef.current.tabs;
    if (prev.some((t) => t.key === key)) {
      setActiveKey(key);
      return;
    }
    const next = [...prev, { key, title, closable: true, lastUsedAt: Date.now() }];
    // Evict tab based on policy if exceeding max
    if (next.length > maxCount) {
      const idx = pickEvictIdx(next);
      if (idx >= 0) {
        const [evicted] = next.splice(idx, 1);
        onEvictRef.current?.([evicted]);
      }
    }
    setTabs(next);
    setActiveKey(key);
  }, [maxCount]);

  // When maxCount decreases, trim excess tabs immediately
  useEffect(() => {
    const { tabs: currentTabs, activeKey: currentActive } = stateRef.current;
    if (currentTabs.length <= maxCount) return;
    const next = [...currentTabs];
    const evicted: TabItem[] = [];
    while (next.length > maxCount) {
      const idx = pickEvictIdx(next);
      if (idx < 0) break;
      evicted.push(...next.splice(idx, 1));
    }
    setTabs(next);
    if (!next.some((t) => t.key === currentActive)) {
      setActiveKey('/');
    }
    if (evicted.length > 0) onEvictRef.current?.(evicted);
  }, [maxCount]);

  // setActiveKey 时同步更新 lastUsedAt
  const activateTab = useCallback((key: string) => {
    setTabs((prev) => prev.map((t) => t.key === key ? { ...t, lastUsedAt: Date.now() } : t));
    setActiveKey(key);
  }, []);

  const removeTab = useCallback((key: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.key === key);
      if (idx < 0 || !prev[idx].closable) return prev;
      return prev.filter((t) => t.key !== key);
    });
    setActiveKey((prevActive) => {
      if (prevActive !== key) return prevActive;
      const idx = tabs.findIndex((t) => t.key === key);
      if (idx > 0) return tabs[idx - 1].key;
      if (tabs.length > 1) return tabs[1].key;
      return '/';
    });
  }, [tabs]);

  const closeOthers = useCallback((key: string) => {
    const nextTabs = stateRef.current.tabs.filter((t) => !t.closable || t.key === key);
    setTabs(nextTabs);
    setActiveKey(key);
    return key;
  }, []);

  const closeLeft = useCallback((key: string) => {
    const { tabs: currentTabs, activeKey: currentActive } = stateRef.current;
    const idx = currentTabs.findIndex((t) => t.key === key);
    if (idx < 0) return currentActive;
    const nextTabs = currentTabs.filter((t, i) => !t.closable || i >= idx);
    const nextActive = nextTabs.some((t) => t.key === currentActive) ? currentActive : key;
    setTabs(nextTabs);
    setActiveKey(nextActive);
    return nextActive;
  }, []);

  const closeRight = useCallback((key: string) => {
    const { tabs: currentTabs, activeKey: currentActive } = stateRef.current;
    const idx = currentTabs.findIndex((t) => t.key === key);
    if (idx < 0) return currentActive;
    const nextTabs = currentTabs.filter((t, i) => !t.closable || i <= idx);
    const nextActive = nextTabs.some((t) => t.key === currentActive) ? currentActive : key;
    setTabs(nextTabs);
    setActiveKey(nextActive);
    return nextActive;
  }, []);

  const closeAll = useCallback(() => {
    setTabs([HOME_TAB]);
    setActiveKey('/');
  }, []);

  const reorderTabs = useCallback((fromKey: string, toKey: string) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.key === fromKey);
      const to = prev.findIndex((t) => t.key === toKey);
      if (from < 0 || to < 0 || from === to) return prev;
      // 禁止跨区段拖拽：pinned ↔ regular 不可混排
      const fromTab = prev[from];
      const toTab = prev[to];
      if (!!fromTab.pinned !== !!toTab.pinned) return prev;
      // home tab 不可移动
      if (fromTab.key === '/' || toTab.key === '/') return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const pinTab = useCallback((key: string) => {
    setTabs((prev) => sortTabs(prev.map((t) => t.key === key ? { ...t, pinned: true, closable: false } : t)));
  }, []);

  const unpinTab = useCallback((key: string) => {
    setTabs((prev) => sortTabs(prev.map((t) => t.key === key ? { ...t, pinned: false, closable: true } : t)));
  }, []);

  return { tabs, activeKey, setActiveKey: activateTab, addTab, removeTab, closeOthers, closeLeft, closeRight, closeAll, reorderTabs, pinTab, unpinTab };
}
