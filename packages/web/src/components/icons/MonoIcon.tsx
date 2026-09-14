import type { CSSProperties, SVGProps } from 'react';

/** 由 scripts/gen-iconify-assets.mjs 从 @iconify-json 集合抽取的单色图标数据（body 为构建期可信的 SVG 片段） */
export interface MonoIconData {
  body: string;
  width: number;
  height: number;
}

export interface MonoIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'dangerouslySetInnerHTML'> {
  icon: MonoIconData;
  /** 渲染尺寸（px），缺省 16；非正方形图标按宽高比缩放高度 */
  size?: number;
  style?: CSSProperties;
}

/**
 * 单色 Iconify 图标：内联 SVG，`currentColor` 跟随文字颜色（<img> 做不到），
 * 替代 @iconify/react 在运行时向公网 API 拉取图标数据。图标数据全部来自构建期生成的 mono-icons.ts。
 */
export function MonoIcon({ icon, size = 16, style, ...rest }: Readonly<MonoIconProps>) {
  const height = icon.width === icon.height ? size : Math.round((size * icon.height) / icon.width);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      width={size}
      height={height}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
      {...rest}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
