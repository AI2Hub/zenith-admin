import { Children } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Input, List, Spin } from '@douyinfe/semi-ui';
import { Search } from 'lucide-react';
import './NavListPanel.css';

/* ─────────────────────────── NavListPanel ──────────────────────────────── */

export interface NavListPanelSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnterPress?: () => void;
}

export interface NavListPanelProps {
  /** 标题栏左侧文字 */
  title?: ReactNode;
  /** 标题栏右侧操作区（按钮/下拉菜单等） */
  headerExtra?: ReactNode;
  /** 如果提供，在标题栏下方渲染搜索输入框 */
  search?: NavListPanelSearchProps;
  /** 列表加载中 */
  loading?: boolean;
  /** 空状态文字 */
  emptyText?: string;
  /** 底部插槽（分页等） */
  footer?: ReactNode;
  /** 列表条目 */
  children?: ReactNode;
  style?: CSSProperties;
  /** 是否去掉 body 的 padding（用于 Collapse 分组等场景） */
  bodyNoPadding?: boolean;
  /**
   * 原样渲染 children，不套内置的 Semi `<List>` 容器（用于分组 Collapse 等自定义布局，
   * 由调用方自行组合 `<List>` 与空状态）。默认 false：会把扁平 children 包进 `<List>`。
   */
  rawBody?: boolean;
}

export function NavListPanel({
  title,
  headerExtra,
  search,
  loading,
  emptyText = '暂无数据',
  footer,
  children,
  style,
  bodyNoPadding,
  rawBody,
}: Readonly<NavListPanelProps>) {
  const childCount = Children.count(children);

  /** 搜索框节点，复用于 List header 槽（标准模式）或独立 div（rawBody 模式）。 */
  const searchInput = search ? (
    <Input
      prefix={<Search size={14} />}
      placeholder={search.placeholder ?? '搜索'}
      value={search.value}
      onChange={search.onChange}
      onEnterPress={search.onEnterPress}
      showClear
      size="small"
    />
  ) : null;

  return (
    <div className="nav-list-panel" style={style}>
      {(title !== undefined || headerExtra !== undefined) && (
        <div className="nav-list-panel__header">
          {title !== undefined && (
            <span className="nav-list-panel__title">{title}</span>
          )}
          {headerExtra !== undefined && (
            <div className="nav-list-panel__header-extra">{headerExtra}</div>
          )}
        </div>
      )}

      {rawBody ? (
        /* rawBody 模式（如 DbAdmin Collapse 分组）：保留 div 布局结构 */
        <>
          {searchInput !== null && (
            <div className="nav-list-panel__search">{searchInput}</div>
          )}
          <div className={`nav-list-panel__body${bodyNoPadding ? ' nav-list-panel__body--no-padding' : ''}`}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spin />
              </div>
            )}
            {!loading && children}
          </div>
          {footer != null && (
            <div className="nav-list-panel__footer">{footer}</div>
          )}
        </>
      ) : (
        /* 标准模式（Semi 带筛选器最佳实践）：
         *   - 搜索框 → List header 槽（固定不滚动）
         *   - 条目列表 → List 主体（Spin wrapper 承载滚动）
         *   - 分页 footer → List footer 槽（固定不滚动）
         *   - loading / 空状态 → List 原生 prop */
        <List
          split={false}
          loading={loading}
          emptyContent={<div className="nav-list-panel__empty">{emptyText}</div>}
          header={searchInput ?? undefined}
          footer={footer ?? undefined}
          className="nav-list-panel__list"
        >
          {/* 无条目时传 null，触发 List 的 emptyContent（传空数组不触发） */}
          {childCount > 0 ? children : null}
        </List>
      )}
    </div>
  );
}

/* ─────────────────────────── NavListItem ───────────────────────────────── */

export interface NavListItemProps {
  /** 高亮激活状态 */
  active?: boolean;
  onClick?: () => void;
  /** 主标题（加粗） */
  primary: ReactNode;
  /** 副标题（主标题后 · 分隔，省略样式） */
  secondary?: ReactNode;
  /** 底部元信息行（日期/大小/标签等，颜色更淡） */
  meta?: ReactNode;
  /** 左侧图标 */
  icon?: ReactNode;
  /**
   * 右侧操作区，默认 hover/active 时才可见。
   * 如需始终显示，设置 `extraAlwaysVisible`。
   */
  extra?: ReactNode;
  /** 让 extra 区域始终可见（不随 hover 隐藏） */
  extraAlwaysVisible?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function NavListItem({
  active,
  onClick,
  primary,
  secondary,
  meta,
  icon,
  extra,
  extraAlwaysVisible,
  style,
  className,
}: Readonly<NavListItemProps>) {
  return (
    <List.Item
      className={[
        'nav-list-item',
        active ? 'nav-list-item--active' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      style={style}
    >
      {icon && <span className="nav-list-item__icon">{icon}</span>}

      <div className="nav-list-item__body">
        <div className="nav-list-item__row1">
          <span className="nav-list-item__primary">{primary}</span>
          {secondary !== undefined && (
            <>
              <span className="nav-list-item__sep">·</span>
              <span className="nav-list-item__secondary">{secondary}</span>
            </>
          )}
        </div>
        {meta !== undefined && (
          <div className="nav-list-item__meta">{meta}</div>
        )}
      </div>

      {extra !== undefined && (
        <div className={`nav-list-item__extra${extraAlwaysVisible ? ' nav-list-item__extra--visible' : ''}`}>
          {extra}
        </div>
      )}
    </List.Item>
  );
}
