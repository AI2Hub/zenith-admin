import { beforeEach, describe, expect, it } from 'vitest';
import { render,} from '@testing-library/react';
import {} from '@zenith/shared/core';
import {} from '@zenith/shared/preferences';
import {} from '@/lib/preference-cache';
import {} from '@/test-utils/preferences';
import  { LoadingIndicator } from './PageLoading';
import {
  LOADING_STYLES,
  LOADING_STYLE_OPTIONS,

} from '@/hooks/usePreferences';

describe('PageLoading', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('每种动画都有中文名称（选择行与策略面板都直接展示 label）', () => {
    expect(LOADING_STYLE_OPTIONS.length).toBe(LOADING_STYLES.length);
    expect(LOADING_STYLE_OPTIONS.every((option) => option.label.length > 0)).toBe(true);
  });

  // 防涏回：向 LOADING_STYLES 加一种动画却忘了在 LoadingIndicator 里写标记时，
  // 选择行的预览会是一块空白，而“没报错、只是空”极难被发现
  it.each(LOADING_STYLES)('每一种已声明的加载动画都有可见标记（%s）', (variant) => {
    const { container } = render(<LoadingIndicator variant={variant} />);
    const indicator = container.firstElementChild;
    expect(indicator).toHaveAttribute('data-loading-style', variant);
    expect(indicator?.childElementCount).toBeGreaterThan(0);
  });
});
