import type { CSSProperties } from 'react';
import { MONO_ICONS, type MonoIconId } from './icons/generated/mono-icons';
import { MonoIcon } from './icons/MonoIcon';

/**
 * 文件类型 / 文件夹 / shell 图标（`utils/fileIcons.ts` 返回的 iconify 图标 id）。
 *
 * 彩色的 vscode-icons 来自构建期生成的 `assets/file-icons/*.svg`：这里只 eager 引入它们的 URL（每个几十字节），
 * 图标本体按可见类型逐个下载，文件名含内容 hash 命中长期缓存；全量约 700 KB 不打进 bundle。
 * 单色图标（codicon 等）需跟随文字颜色，走内联的 MonoIcon。未知 id 退回通用文件图标。
 */
const FILE_ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/file-icons/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>)
    .map(([file, url]) => [`vscode-icons:${file.slice(file.lastIndexOf('/') + 1, -'.svg'.length)}`, url]),
);

const FALLBACK_ICON = 'vscode-icons:default-file';

export interface FileTypeIconProps {
  /** iconify 图标 id，如 `vscode-icons:file-type-typescript` */
  icon: string;
  /** 渲染尺寸（px），缺省 16 */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function FileTypeIcon({ icon, size = 16, className, style }: Readonly<FileTypeIconProps>) {
  if (icon in MONO_ICONS) {
    return <MonoIcon icon={MONO_ICONS[icon as MonoIconId]} size={size} className={className} style={style} />;
  }
  const src = FILE_ICON_URLS[icon] ?? FILE_ICON_URLS[FALLBACK_ICON];
  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
    />
  );
}

export default FileTypeIcon;
