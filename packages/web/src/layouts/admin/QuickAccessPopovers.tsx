import { Button, List, Popover } from '@douyinfe/semi-ui';
import { Star, X } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import type { FlatMenuItem } from '@/components/MenuSearchInput';

export function FavoritesPopover({
  favorites,
  flatMenus,
  navigate,
  toggleFavorite,
}: Readonly<{
  favorites: number[];
  flatMenus: FlatMenuItem[];
  navigate: NavigateFunction;
  toggleFavorite: (id: number) => void;
}>) {
  return (
    <Popover
      position="bottomRight"
      trigger="hover"
      mouseEnterDelay={200}
      mouseLeaveDelay={300}
      showArrow
      content={
        <div style={{ width: 260, maxHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px 8px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--semi-color-border)' }}>
            我的收藏
          </div>
          {favorites.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: 13 }}>
              暂无收藏，点击面包屑右侧 ⭐ 可收藏当前页
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <List
                size="small"
                dataSource={favorites.map((id) => flatMenus.find((m) => m.id === id)).filter(Boolean)}
                renderItem={(menu) => (
                  <List.Item
                    style={{ padding: '0 4px 0 0' }}
                    main={
                      <button
                        type="button"
                        onClick={() => { navigate(menu!.path); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0 7px 14px', cursor: 'pointer', minWidth: 0, flex: 1, border: 0, background: 'transparent', textAlign: 'left' }}
                      >
                        <span style={{ color: 'var(--semi-color-warning)', display: 'flex', flexShrink: 0 }}>
                          <Star size={13} fill="currentColor" strokeWidth={0} />
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{menu!.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--semi-color-text-3)', flexShrink: 0 }}>{menu!.breadcrumb.at(-1) ?? ''}</span>
                      </button>
                    }
                    extra={
                      <Button
                        icon={<X size={13} />}
                        theme="borderless"
                        type="tertiary"
                        size="small"
                        title="移除收藏"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(menu!.id); }}
                      />
                    }
                  />
                )}
              />
            </div>
          )}
        </div>
      }
    >
      <div className="admin-header-action" style={{ display: 'inline-flex', cursor: 'pointer' }}>
        <button
          type="button"
          className="admin-theme-btn"
          title="我的收藏"
        >
          <Star size={16} strokeWidth={1.5} />
        </button>
      </div>
    </Popover>
  );
}
