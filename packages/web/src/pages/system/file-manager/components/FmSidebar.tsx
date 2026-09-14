/** 侧栏：Windows 盘符切换 + 收藏夹 + 当前目录子文件夹速览 */
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { Button } from '@douyinfe/semi-ui';
import { Star, X } from 'lucide-react';
import { getFolderIcon } from '@/utils/fileIcons';
import type { FsEntry, RootInfo } from '../types';

interface FmSidebarProps {
  readonly rootInfo: RootInfo | null;
  readonly currentPath: string;
  readonly sidebarDirs: FsEntry[];
  readonly bookmarks: { name: string; path: string }[];
  readonly onNavigate: (path: string) => void;
  readonly onRemoveBookmark: (path: string) => void;
}

export default function FmSidebar({ rootInfo, currentPath, sidebarDirs, bookmarks, onNavigate, onRemoveBookmark }: Readonly<FmSidebarProps>) {
  return (
    <>
      {rootInfo?.isWindows && rootInfo.drives.length > 1 && (
        <div className="fm-sidebar__drives">
          {rootInfo.drives.map((d) => {
            const isActive = currentPath.toUpperCase().startsWith(d.toUpperCase());
            return (
              <Button
                key={d}
                size="small"
                theme={isActive ? 'solid' : 'borderless'}
                type={isActive ? 'primary' : 'tertiary'}
                style={{ minWidth: 36 }}
                onClick={() => onNavigate(d + '\\')}
              >
                {d}
              </Button>
            );
          })}
        </div>
      )}
      {bookmarks.length > 0 && (
        <div className="fm-sidebar__bookmarks">
          <div className="fm-sidebar__section-title">收藏</div>
          {bookmarks.map((b) => (
            <div key={b.path} className={`fm-sidebar__bookmark-row${b.path === currentPath ? ' fm-sidebar__bookmark-row--active' : ''}`}>
              <button
                type="button"
                className="fm-sidebar__bookmark-link"
                title={b.path}
                onClick={() => onNavigate(b.path)}
              >
                <Star size={12} style={{ flexShrink: 0, color: 'var(--semi-color-warning)' }} fill="currentColor" />
                <span>{b.name}</span>
              </button>
              <button
                type="button"
                className="fm-sidebar__bookmark-remove"
                aria-label={`移除收藏 ${b.name}`}
                onClick={() => onRemoveBookmark(b.path)}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="fm-sidebar__dirs">
        {sidebarDirs.map((d) => (
          <button
            key={d.path}
            type="button"
            className={`fm-sidebar__dir-item${d.path === currentPath ? ' fm-sidebar__dir-item--active' : ''}`}
            onClick={() => onNavigate(d.path)}
          >
            <FileTypeIcon icon={getFolderIcon(d.name, false)} size={14} />
            <span>{d.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
