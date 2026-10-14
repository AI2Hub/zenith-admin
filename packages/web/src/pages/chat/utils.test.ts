import { describe, expect, it } from 'vitest';
import {
  resolveChatImageBox,
} from './utils';

describe('resolveChatImageBox', () => {
  it('按宽高比等比缩放且不放大', () => {
    // 横图：宽顶满 240，高按比例
    expect(resolveChatImageBox(1200, 600)).toEqual({ width: 240, height: 120, hasRatio: true });
    // 高图：高顶满 200
    expect(resolveChatImageBox(300, 600)).toEqual({ width: 100, height: 200, hasRatio: true });
    // 小图不放大
    expect(resolveChatImageBox(100, 80)).toEqual({ width: 100, height: 80, hasRatio: true });
  });

  it('缺宽高时返回默认占位', () => {
    expect(resolveChatImageBox(null, null)).toEqual({ width: 240, height: 180, hasRatio: false });
    expect(resolveChatImageBox(undefined, undefined)).toEqual({ width: 240, height: 180, hasRatio: false });
  });
});
