import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { LogLevel, MatchRange, SearchMatch } from './log-search';
import { LogLineText } from './LogLineText';
import { DEFAULT_LOG_PALETTE, LOG_PALETTE_STYLES, type LogPaletteId } from './log-palettes';
import './LogContentView.css';

export interface LogContentViewProps {
  /** 原始行（静态内容或 tail 缓冲；可含 ANSI 颜色序列，渲染时按片段着色） */
  lines: string[];
  /** 展示行 → 原始行下标（级别过滤后的可见行） */
  visibleIndexes: number[];
  /** 每个原始行的有效级别 */
  levels: Array<LogLevel | null>;
  /** 展示行下标 → 匹配区间 */
  lineRanges: Map<number, MatchRange[]>;
  /** 当前激活匹配（lineIndex 为展示行下标） */
  activeMatch: SearchMatch | null;
  palette?: LogPaletteId;
  showLineNumbers: boolean;
  wrap: boolean;
  /** 实时追踪中：新行到达时若已在底部则跟随；禁用匹配自动定位 */
  following: boolean;
  /** 变化时（切换文件/刷新/开始追踪）滚动到底部 */
  resetKey: string;
  emptyText: string;
}

export interface LogContentViewHandle {
  scrollToTop: () => void;
  /** 按原始行号（1-based）定位；目标行被过滤时跳到其后最近的可见行 */
  scrollToOriginalLine: (lineNo: number) => void;
}

export const LogContentView = forwardRef<LogContentViewHandle, LogContentViewProps>(function LogContentView({
  lines, visibleIndexes, levels, lineRanges, activeMatch,
  showLineNumbers, wrap, following, resetKey, emptyText, palette = DEFAULT_LOG_PALETTE,
}, ref) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const atBottomRef = useRef(true);
  const pinRafRef = useRef(0);
  const pinningRef = useRef(false);

  const count = visibleIndexes.length;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 19,
    overscan: 15,
    paddingStart: 8,
    paddingEnd: 8,
  });

  const updateAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop < 40);
    // 钉底期间虚拟行异步测量会产生瞬时偏差，忽略，避免钉底被误判为用户上滚
    if (pinningRef.current) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottomRef.current !== next) {
      atBottomRef.current = next;
      setAtBottom(next);
    }
  }, []);

  /** 用户主动滚动（滚轮/触摸/按住滚动条）→ 立即停止钉底，交还控制权 */
  const cancelPin = useCallback(() => {
    if (!pinningRef.current) return;
    pinningRef.current = false;
    cancelAnimationFrame(pinRafRef.current);
  }, []);

  const scrollToBottom = useCallback((settleMs = 400) => {
    // 动态行高测量会在滚动后继续修正总高度，短暂钉住底部直到稳定
    cancelAnimationFrame(pinRafRef.current);
    pinningRef.current = true;
    atBottomRef.current = true;
    setAtBottom(true);
    const deadline = performance.now() + settleMs;
    const pin = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (performance.now() < deadline && pinningRef.current) {
        pinRafRef.current = requestAnimationFrame(pin);
      } else {
        pinningRef.current = false;
      }
    };
    pinRafRef.current = requestAnimationFrame(pin);
  }, []);

  useEffect(() => () => cancelAnimationFrame(pinRafRef.current), []);

  const scrollToTop = useCallback(() => {
    cancelPin();
    atBottomRef.current = false;
    setAtBottom(false);
    setAtTop(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [cancelPin]);

  const scrollToOriginalLine = useCallback((lineNo: number) => {
    if (visibleIndexes.length === 0) return;
    const target = lineNo - 1;
    // visibleIndexes 升序：二分找第一个 >= target 的展示行
    let lo = 0;
    let hi = visibleIndexes.length - 1;
    let found = visibleIndexes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (visibleIndexes[mid] >= target) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    cancelPin();
    virtualizer.scrollToIndex(found, { align: 'center' });
    requestAnimationFrame(updateAtBottom);
  }, [visibleIndexes, virtualizer, cancelPin, updateAtBottom]);

  useImperativeHandle(ref, () => ({ scrollToTop, scrollToOriginalLine }), [scrollToTop, scrollToOriginalLine]);

  // 数据源变化（切换文件/刷新/开始追踪）→ 回到底部（日志约定：最新内容在末尾）
  useEffect(() => {
    scrollToBottom();
  }, [resetKey, scrollToBottom]);

  // 内容追加（tail）→ 仅当用户已在底部时才跟随，避免打断向上翻阅
  useEffect(() => {
    if (!atBottomRef.current) return;
    scrollToBottom(150);
  }, [lines, count, scrollToBottom]);

  // 换行/行号切换会改变行高，重置测量缓存
  useEffect(() => {
    virtualizer.measure();
  }, [wrap, showLineNumbers, virtualizer]);

  // 定位到当前激活匹配；追踪模式下行窗口滑动导致下标漂移，禁用自动定位
  useEffect(() => {
    if (!activeMatch || following) return;
    cancelPin();
    atBottomRef.current = false;
    setAtBottom(false);
    virtualizer.scrollToIndex(activeMatch.lineIndex, { align: 'center' });
    requestAnimationFrame(updateAtBottom);
  }, [activeMatch, following, virtualizer, cancelPin, updateAtBottom, resetKey]);

  const digits = Math.max(2, String(lines.length).length);
  const activeLine = activeMatch?.lineIndex ?? -1;
  const items = virtualizer.getVirtualItems();

  return (
    <div className="log-content-view" data-palette={palette} style={{ ...LOG_PALETTE_STYLES.get(palette), flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <div
        ref={scrollRef}
        onScroll={updateAtBottom}
        onWheel={cancelPin}
        onTouchMove={cancelPin}
        onPointerDown={cancelPin}
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: 'var(--log-background)',
          fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--logtok-plain)',
        }}
      >
        {count === 0 ? (
          <div style={{ padding: '12px 16px' }}>
            <Typography.Text type="tertiary" style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--logtok-dim)' }}>
              {emptyText}
            </Typography.Text>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: '100%' }}>
            {items.map((item) => {
              const originalIndex = visibleIndexes[item.index];
              const text = lines[originalIndex] ?? '';
              const level = levels[originalIndex];
              const ranges = lineRanges.get(item.index);
              const isActiveLine = item.index === activeLine;
              const indicator = '3px solid var(--log-row-indicator)';
              return (
                <div
                  key={item.key}
                  className="log-content-row"
                  data-level={level ?? undefined}
                  data-active={isActiveLine}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `translateY(${item.start}px)`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    boxSizing: 'border-box',
                    minWidth: '100%',
                    width: wrap ? '100%' : 'max-content',
                    // 显示行号时，左缩进与激活指示条挂在 sticky 行号列上，随列一起固定
                    padding: showLineNumbers ? '0 16px 0 0' : '0 16px 0 13px',
                    borderLeft: showLineNumbers ? undefined : indicator,
                  }}
                >
                  {showLineNumbers && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        flexShrink: 0,
                        boxSizing: 'content-box',
                        width: `${digits}ch`,
                        padding: '0 12px 0 13px',
                        borderLeft: indicator,
                        textAlign: 'right',
                        color: 'var(--logtok-dim)',
                        userSelect: 'none',
                        whiteSpace: 'pre',
                        backgroundColor: 'var(--log-row-background)',
                      }}
                    >
                      {originalIndex + 1}
                    </span>
                  )}
                  <span
                    style={{
                      flex: wrap ? 1 : undefined,
                      minWidth: 0,
                      whiteSpace: wrap ? 'pre-wrap' : 'pre',
                      wordBreak: wrap ? 'break-all' : undefined,
                    }}
                  >
                    <LogLineText raw={text} ranges={ranges} activeStart={isActiveLine ? (activeMatch?.start ?? null) : null} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {count > 0 && (
        <div style={{ position: 'absolute', right: 20, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {!atTop && (
            <Tooltip content="回到顶部" position="left">
              <Button
                icon={<ChevronsUp size={14} />}
                size="small"
                theme="solid"
                type="tertiary"
                style={{ borderRadius: 16, opacity: 0.85 }}
                onClick={scrollToTop}
              />
            </Tooltip>
          )}
          {!atBottom && (
            <Button
              icon={<ChevronsDown size={14} />}
              size="small"
              theme="solid"
              type="tertiary"
              style={{ borderRadius: 16, opacity: 0.85 }}
              onClick={() => scrollToBottom()}
            >
              回到底部
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
