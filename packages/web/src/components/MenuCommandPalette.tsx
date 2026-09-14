import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@douyinfe/semi-ui';
import { textMatches } from '@/utils/pinyin';
import { Search, Clock, Hash } from 'lucide-react';
import { renderLucideIcon } from '@/utils/icons';
import { useOptionalPreferences } from '@/hooks/usePreferences';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { FlatMenuItem } from './MenuSearchInput';

interface Props {
  readonly menus: FlatMenuItem[];
  /** 最近访问菜单（与全局路由访问记录共享，来自 useRecentMenus） */
  readonly recentMenus: FlatMenuItem[];
  readonly onClearRecents: () => void;
  readonly open: boolean;
  readonly onClose: () => void;
}

function getItemIcon(item: FlatMenuItem, isRecent: boolean) {
  if (item.icon) {
    const icon = renderLucideIcon(item.icon, 13);
    if (icon) return icon;
  }
  return isRecent ? <Clock size={13} /> : <Hash size={13} />;
}

export default function MenuCommandPalette({ menus, recentMenus, onClearRecents, open, onClose }: Props) {
  const navigate = useNavigate();
  // 全局快捷键偏好：关闭后 Ctrl+K 不再唤起（组件可能在 Provider 外使用，做可选兜底）
  const shortcutsEnabled = useOptionalPreferences()?.preferences.enableShortcuts ?? true;
  // 触屏设备上键盘操作提示（↑↓ / ↵ / ESC / Ctrl+K）不可用，纯属占用纵向空间
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useCallback(
    (q: string): FlatMenuItem[] => {
      if (!q.trim()) return [];
      return menus
        .filter((m) => textMatches(m.title, q) || m.breadcrumb.some((b) => textMatches(b, q)))
        .slice(0, 10);
    },
    [menus]
  )(query);

  const displayItems = query.trim() ? results : recentMenus;
  const isShowingRecent = !query.trim();

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);


  // 选中后无需手动记录：路由变化时 useRecentMenus 会自动追加
  const handleSelect = useCallback(
    (item: FlatMenuItem) => {
      onClose();
      navigate(item.path);
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        const item = displayItems[selectedIndex];
        if (item) handleSelect(item);
      }
    },
    [displayItems, selectedIndex, handleSelect, onClose]
  );

  // Global keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        if (!shortcutsEnabled) return;
        e.preventDefault();
        if (open) {
        onClose();
      } else {
        // trigger open via custom event
        globalThis.dispatchEvent(new CustomEvent('open-menu-palette'));
      }
      }
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [open, onClose, shortcutsEnabled]);

  return (
    <Modal
      visible={open}
      header={null}
      footer={null}
      closable={false}
      onCancel={onClose}
      closeOnEsc={false}
      maskClosable
      width={600}
      className="cmd-palette-modal"
      // 顶部锚定（覆盖默认 margin: 80px auto）：列表高度变化时只向下伸缩，避免垂直居中导致的跳动
      style={{ margin: '12vh auto', overflow: 'hidden', borderRadius: 'var(--semi-border-radius-large)', padding: 0 }}
      bodyStyle={{ padding: 0, overflow: 'hidden' }}
      zIndex={9999}
      keepDOM={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
        {/* Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--semi-color-border)',
          }}
        >
          <Search size={17} style={{ color: 'var(--semi-color-text-2)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索菜单..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: 'var(--semi-color-text-0)',
              lineHeight: '22px',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                border: 'none',
                borderRadius: 'var(--semi-border-radius-small)',
                background: 'var(--semi-color-fill-1)',
                color: 'var(--semi-color-text-2)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>✕</span>
            </button>
          )}
          {!isMobile && (
            <kbd
              className="cmd-palette-esc"
              style={{
                fontSize: 11,
                color: 'var(--semi-color-text-2)',
                background: 'var(--semi-color-fill-0)',
                border: '1px solid var(--semi-color-border)',
                borderRadius: 'var(--semi-border-radius-small)',
                padding: '1px 5px',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              ESC
            </kbd>
          )}
        </div>

        {/* List Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 0',
            minHeight: 0,
          }}
        >
          {/* Section header */}
          {isShowingRecent && recentMenus.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 16px 6px',
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--semi-color-text-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                最近访问
              </span>
              <button
                type="button"
                onClick={onClearRecents}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'var(--semi-color-text-2)',
                  padding: '0 2px',
                }}
              >
                清除
              </button>
            </div>
          )}

          {isShowingRecent && recentMenus.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: 'var(--semi-color-text-2)',
                fontSize: 13,
              }}
            >
              <Hash size={28} style={{ margin: '0 auto 10px', opacity: 0.35, display: 'block' }} />
              输入关键词搜索菜单
            </div>
          )}

          {!isShowingRecent && displayItems.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: 'var(--semi-color-text-2)',
                fontSize: 13,
              }}
            >
              未找到匹配的菜单
            </div>
          )}

          {/* Items */}
          <div ref={listRef}>
            {displayItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    background: isSelected ? 'var(--semi-color-primary-light-default)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      borderRadius: 'var(--semi-border-radius-medium)',
                      background: isSelected ? 'var(--semi-color-primary)' : 'var(--semi-color-fill-1)',
                      color: isSelected ? '#fff' : 'var(--semi-color-primary)',
                    }}
                  >
                    {getItemIcon(item, isShowingRecent)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: isSelected ? 'var(--semi-color-primary)' : 'var(--semi-color-text-0)',
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.title}
                    </div>
                    {item.breadcrumb.length > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--semi-color-text-2)',
                          lineHeight: 1.3,
                          marginTop: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.breadcrumb.join(' › ')}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <kbd
                      style={{
                        fontSize: 10,
                        color: 'var(--semi-color-primary)',
                        background: 'var(--semi-color-primary-light-default)',
                        border: '1px solid var(--semi-color-primary-light-hover)',
                        borderRadius: 'var(--semi-border-radius-small)',
                        padding: '1px 5px',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      ↵
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer：仅桌面端展示键盘操作提示 */}
        {!isMobile && (
          <div
            className="cmd-palette-footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '7px 16px',
              borderTop: '1px solid var(--semi-color-border)',
              fontSize: 11,
              color: 'var(--semi-color-text-2)',
            }}
          >
            <span><kbd style={{ fontFamily: 'monospace', fontSize: 10, padding: '0 3px', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)' }}>↑↓</kbd> 导航</span>
            <span><kbd style={{ fontFamily: 'monospace', fontSize: 10, padding: '0 3px', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)' }}>↵</kbd> 跳转</span>
            <span><kbd style={{ fontFamily: 'monospace', fontSize: 10, padding: '0 3px', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)' }}>ESC</kbd> 关闭</span>
            <span style={{ marginLeft: 'auto' }}>
              <kbd style={{ fontFamily: 'monospace', fontSize: 10, padding: '0 3px', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)' }}>Ctrl K</kbd> 快速打开
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
