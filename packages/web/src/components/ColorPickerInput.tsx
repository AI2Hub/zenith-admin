import { ColorPicker } from '@douyinfe/semi-ui';
import type { CSSProperties } from 'react';

export interface ColorPickerInputProps {
  /** 颜色值（hex，或开启 alpha 时为 rgba 字符串） */
  value?: string;
  onChange?: (value: string) => void;
  /** 是否支持透明度 */
  alpha?: boolean;
  /** 只读态：展示色块 + 文本，不渲染交互选择器（ColorPicker 无 disabled 属性） */
  disabled?: boolean;
  style?: CSSProperties;
}

/**
 * 颜色选择器 — 基于 Semi ColorPicker 封装，表单值统一存储为字符串（hex / rgba）。
 * 可直接用于 Semi Form（withField 包裹）。
 */
export default function ColorPickerInput({
  value,
  onChange,
  alpha = false,
  disabled = false,
  style,
}: Readonly<ColorPickerInputProps>) {
  if (disabled) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
        <span style={{
          width: 20, height: 20, borderRadius: 'var(--semi-border-radius-small)',
          border: '1px solid var(--semi-color-border)',
          background: value || 'transparent',
        }} />
        <span style={{ fontSize: 13, color: 'var(--semi-color-text-1)' }}>{value || '（未选择）'}</span>
      </div>
    );
  }

  const colorValue = value ? ColorPicker.colorStringToValue(value) : undefined;
  return (
    <ColorPicker
      usePopover
      alpha={alpha}
      value={colorValue}
      onChange={(v) => {
        const next = alpha
          ? `rgba(${v.rgba.r}, ${v.rgba.g}, ${v.rgba.b}, ${Number(v.rgba.a.toFixed(2))})`
          : v.hex;
        onChange?.(next);
      }}
      style={style}
    />
  );
}
