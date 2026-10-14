import type { CSSProperties, ReactNode } from 'react';
import './stat-card.css';

/**
 * 统计栅格用 auto-fit + minmax 随容器宽度调整列数。
 * 禁止内联固定 gridTemplateColumns：媒体查询无法覆盖，窄屏会将内容压成竖排。
 * 指标间以 1px 竖线分隔，但动态列数无法用 nth-child 识别行首：
 * 内层栅格左右各以负 margin 外扩一个 padding，由 wrap 的 overflow: hidden 裁掉行首竖线。
 */
export function StatGrid({
  children,
  minItemWidth = 180,
  gap = 14,
  className,
  style,
}: Readonly<{
  children: ReactNode;
  /** 单列轨道最小宽度，低于此值即减少列数 */
  minItemWidth?: number;
  /** 每栏的上下内边距。换行时行距由它撑开——不用 row-gap，否则竖线会被切断 */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}>) {
  return (
    <div className={['zx-stat-wrap', className].filter(Boolean).join(' ')} style={style}>
      <div
        className="zx-stat-grid"
        style={{
          // 自定义属性交给 CSS 计算列宽，避免把 grid-template-columns 写成内联样式
          ['--zx-stat-min' as string]: `${minItemWidth}px`,
          ['--zx-stat-row-pad' as string]: `${gap}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 统一统计卡片：数值 + 标题（可带图标）+ 副文案 / 环比。
 *
 * 视觉上不是「卡片」而是分栏细线中的一栏：无底色、无边框、无圆角，
 * 分隔完全交给 StatGrid 的竖线，与首页 `.dashboard-stat-item` 保持同一套语言。
 * 覆盖既有各页自定义卡片的能力并集：`delta` 环比、`onClick`/`active` 可筛选态。
 */
export function StatCard({
  title,
  value,
  sub,
  icon,
  accent,
  delta,
  deltaLabel = '较昨日',
  deltaFormat = 'absolute',
  onClick,
  active = false,
  className,
}: Readonly<{
  title: ReactNode;
  value: ReactNode;
  /** 副文案（如「成功 13 · 失败 0」） */
  sub?: ReactNode;
  /** 标题前的小图标，尺寸由 CSS 统一收敛，页面传多大都一样 */
  icon?: ReactNode;
  /** 强调色：作用于数值与图标 */
  accent?: string;
  /** 环比增量，正负分别显示为成功/危险色；null 或 undefined 时不渲染 */
  delta?: number | null;
  deltaLabel?: string;
  /** `absolute` 直接展示数值；`ratio` 按比率渲染为百分比（0.12 → +12.0%） */
  deltaFormat?: 'absolute' | 'ratio';
  /** 传入后卡片变为可点击（用于按状态筛选列表） */
  onClick?: () => void;
  /** 可点击卡片的选中态 */
  active?: boolean;
  className?: string;
}>) {
  const interactive = typeof onClick === 'function';

  const body = (
    <>
      <span className="zx-stat__value" style={accent ? { color: accent } : undefined}>{value}</span>
      <span className="zx-stat__title">
        {icon && <span className="zx-stat__icon" style={accent ? { color: accent } : undefined}>{icon}</span>}
        {title}
      </span>
      {sub !== undefined && sub !== null && sub !== '' && (
        <span className="zx-stat__sub">{sub}</span>
      )}
      {delta !== undefined && delta !== null && Number.isFinite(delta) && (
        <span className={`zx-stat__delta zx-stat__delta--${delta >= 0 ? 'up' : 'down'}`}>
          {deltaLabel} {delta >= 0 ? '+' : ''}
          {deltaFormat === 'ratio' ? `${(delta * 100).toFixed(1)}%` : delta}
        </span>
      )}
    </>
  );

  const classes = [
    'zx-stat',
    interactive && 'zx-stat--interactive',
    interactive && active && 'zx-stat--active',
    className,
  ].filter(Boolean).join(' ');

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-pressed={active}
        // 选中态不再靠边框（已无边框），改用底部 2px 强调条
        style={active && accent ? { boxShadow: `inset 0 -2px 0 ${accent}` } : undefined}
      >
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}
