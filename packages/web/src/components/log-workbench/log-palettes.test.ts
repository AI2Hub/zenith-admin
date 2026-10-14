import { describe, expect, it } from 'vitest';
import { LOG_PALETTES, resolveLogPalette } from './log-palettes';

function luminance(hex: string): number {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

describe('日志配色可读性', () => {
  it.each(LOG_PALETTES)('$name 的两档语法色 / 时间戳 / 行号对背景均至少为 4.5:1', (palette) => {
    for (const mode of ['light', 'dark'] as const) {
      const { background, ...colors } = palette[mode];
      for (const [kind, color] of Object.entries(colors)) {
        const a = luminance(color);
        const b = luminance(background);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${mode}.${kind}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each([undefined, null, {}, 'removed-palette'])('过期 / 非法偏好安全回退', (value) => {
    expect(resolveLogPalette(value).id).toBe('github');
  });
});
