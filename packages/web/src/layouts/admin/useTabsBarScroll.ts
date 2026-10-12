import { useEffect, useRef } from 'react';

// ─── Tabs 滚动 ─────────────────────────────────────────────────────────────
export function useTabsBarScroll(activeKey: string, tabsLength: number, enableTabs: boolean, isSideTabs = false) {
  const activeTabRef = useRef<HTMLDivElement>(null);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 延迟以确保 DOM 已完成渲染
    const timer = setTimeout(() => {
      if (activeTabRef.current) {
        activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeKey, tabsLength]);

  // 滚轮横向滚动：监听挂在整条页签栏，但实际滚动的是内层 __scroll（overflow 在内层）。
  // 垂直页签（左右位置）本身纵向滚动，不劫持滚轮。
  useEffect(() => {
    if (isSideTabs) return;
    const el = tabsBarRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const scrollEl = tabsScrollRef.current;
      if (!scrollEl) return;
      // 纵向滚轮转横向；触控板横向滑动用 deltaX
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      // 没有横向溢出时放行页面默认滚动，避免吞掉滚轮事件
      if (scrollEl.scrollWidth <= scrollEl.clientWidth) return;
      e.preventDefault();
      scrollEl.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enableTabs, tabsLength, isSideTabs]);

  return { activeTabRef, tabsBarRef, tabsScrollRef };
}
