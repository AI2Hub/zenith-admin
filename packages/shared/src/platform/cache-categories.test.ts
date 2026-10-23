/**
 * 缓存分类表：segment / 名称必须唯一，未知前缀回退「其他」。
 */
import { describe, expect, it } from 'vitest';
import {
  CACHE_CATEGORIES,
  CACHE_CATEGORY_BY_SEGMENT,
  CACHE_CATEGORY_COLOR_BY_LABEL,
  CACHE_UNCATEGORIZED_LABEL,
  getCacheCategoryLabel,
} from './cache-categories';

describe('cache categories', () => {
  it('分类首段与展示名称一一对应', () => {
    const segments = CACHE_CATEGORIES.map((category) => category.segment);
    const labels = CACHE_CATEGORIES.map((category) => category.label);
    expect(new Set(segments).size).toBe(segments.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('每个分类都能反查到索引与配色', () => {
    for (const category of CACHE_CATEGORIES) {
      expect(CACHE_CATEGORY_BY_SEGMENT[category.segment]).toBe(category);
      expect(CACHE_CATEGORY_COLOR_BY_LABEL[category.label]).toBe(category.color);
    }
  });

  it('未登记的首段归入「其他」', () => {
    expect(getCacheCategoryLabel('session')).toBe('会话 Token');
    expect(getCacheCategoryLabel('refresh')).toBe('刷新令牌');
    expect(getCacheCategoryLabel('never-registered')).toBe(CACHE_UNCATEGORIZED_LABEL);
  });
});
