import { FONT_FAMILIES, UI_SCALES, type FontFamilyPreference, type UiScale } from '@/hooks/usePreferences';

/**
 * 界面缩放 / 字体偏好：与 `border-radius.ts` 同一机制——写在 body 的内联样式上，
 * Portal 渲染的弹层（Modal / Popover / Toast 等）同样生效。
 *
 * Semi 组件的字号是固定像素值而非 CSS 变量，逐组件覆盖不可行，因此「字号」以 body 的 `zoom` 实现整体缩放
 * （现代浏览器均已按标准实现，布局与定位计算保持一致）。
 */

/** 字体预设 → CSS font-family 栈；system 即 global.css 的默认栈，移除内联覆盖回退到样式表 */
const FONT_FAMILY_STACKS: Record<Exclude<FontFamilyPreference, 'system'>, string> = {
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  'noto-sans-sc': '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
  mono: '"Cascadia Code", "JetBrains Mono", "Fira Code", Menlo, Consolas, "Courier New", monospace',
};

function isUiScale(value: unknown): value is UiScale {
  return typeof value === 'number' && UI_SCALES.includes(value as UiScale);
}

function isFontFamily(value: unknown): value is FontFamilyPreference {
  return typeof value === 'string' && FONT_FAMILIES.includes(value as FontFamilyPreference);
}

export function applyUiScale(scale: unknown) {
  const value = isUiScale(scale) ? scale : 100;
  if (value === 100) {
    document.body.style.removeProperty('zoom');
  } else {
    document.body.style.setProperty('zoom', String(value / 100));
  }
}

export function applyFontFamily(family: unknown) {
  const value = isFontFamily(family) ? family : 'system';
  if (value === 'system') {
    document.body.style.removeProperty('font-family');
  } else {
    document.body.style.setProperty('font-family', FONT_FAMILY_STACKS[value]);
  }
}
