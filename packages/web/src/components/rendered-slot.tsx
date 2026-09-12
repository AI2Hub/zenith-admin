import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * 判断一段节点「实际上」有没有渲染出元素。
 *
 * 工具栏只拿到 ReactNode，看不出 `<ExportButton permission=… />` 这类组件在运行时返回了 null；
 * 单看 `Boolean(node)` 会让移动端出现一个点开是空的「更多操作」菜单。
 * 用 `display: contents` 的探针 span 包住节点（不产生盒子，不影响 Space 的 gap 布局），
 * 每次渲染后读 DOM 子元素数即可得到真实结果。
 */
export function useRenderedSlot(): { probeRef: RefObject<HTMLSpanElement | null>; rendered: boolean } {
  const probeRef = useRef<HTMLSpanElement>(null);
  const [rendered, setRendered] = useState(false);
  useLayoutEffect(() => {
    const next = (probeRef.current?.childElementCount ?? 0) > 0;
    setRendered((prev) => (prev === next ? prev : next));
  });
  return { probeRef, rendered };
}

/** `useRenderedSlot` 的探针容器：`display: contents`，子元素照常参与父级布局 */
export const SlotProbe = forwardRef<HTMLSpanElement, { children?: ReactNode }>(function SlotProbe({ children }, ref) {
  return <span ref={ref} style={{ display: 'contents' }}>{children}</span>;
});
