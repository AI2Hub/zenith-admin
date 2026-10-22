/**
 * RQB 分页 offset 换算单测（全局复用）。
 */
import { describe, it, expect } from 'vitest';
import { pageOffset } from './pagination';

describe('pageOffset', () => {
  it('第 1 页 offset 为 0', () => {
    expect(pageOffset(1, 10)).toBe(0);
  });
});
