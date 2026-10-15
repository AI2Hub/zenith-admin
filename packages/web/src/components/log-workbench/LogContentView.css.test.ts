/**
 * 终端 ANSI 色表校核：直接读取随构建发布的 LogContentView.css，保证浅 / 深两档的
 * 前景色对全部内置配色的背景 ≥4.5:1、色块与背景可辨（≥1.3:1）、色块上的文字 ≥4.5:1。
 * 正则依赖 `--logansi-*: #rrggbb;` 的声明写法与两条规则的选择器，改写需同步本测试。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOG_PALETTES } from './log-palettes';

const css = readFileSync(join(process.cwd(), 'src', 'components', 'log-workbench', 'LogContentView.css'), 'utf8');

function variables(match: (selector: string) => boolean): Record<string, string> {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selector]) => match(selector.trim()));
  if (!rule) throw new Error('未找到 ANSI 变量所在的 CSS 规则');
  return Object.fromEntries([...rule[2].matchAll(/(--[\w-]+):([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const light = variables((selector) => selector === '.log-content-view');
const dark = variables((selector) => selector.includes("theme-mode='dark'"));
const MODES = [['light', light], ['dark', dark]] as const;
const PREFIXES = ['fg', 'bright', 'bg', 'bg-bright'] as const;

function luminance(hex: string): number {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function colors(vars: Record<string, string>, prefix: string): string[] {
  return Array.from({ length: 8 }, (_, index) => {
    const value = vars[`--logansi-${prefix}-${index}`];
    expect(value, `缺少 --logansi-${prefix}-${index}`).toMatch(/^#[0-9a-f]{6}$/);
    return value;
  });
}

const backgroundsOf = (mode: 'light' | 'dark') => LOG_PALETTES.map((palette) => palette[mode].background);

describe('终端 ANSI 色表', () => {
  it.each(MODES)('%s 档前景色对全部配色的背景均 ≥4.5:1', (mode, vars) => {
    const backgrounds = backgroundsOf(mode);
    for (const prefix of ['fg', 'bright'] as const) {
      for (const color of colors(vars, prefix)) {
        for (const background of backgrounds) {
          expect(contrast(color, background), `${prefix} ${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(MODES)('%s 档色块与背景可辨，且其上文字 ≥4.5:1', (mode, vars) => {
    const backgrounds = backgroundsOf(mode);
    const onBg = vars['--logansi-on-bg'];
    expect(onBg, '缺少 --logansi-on-bg').toMatch(/^#[0-9a-f]{6}$/);
    for (const prefix of ['bg', 'bg-bright'] as const) {
      for (const color of colors(vars, prefix)) {
        for (const background of backgrounds) {
          expect(contrast(color, background), `${prefix} ${color} on ${background}`).toBeGreaterThanOrEqual(1.3);
          expect(contrast(onBg, color), `色块上的文字 on ${color}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(MODES)('%s 档色块文字色可读，且两档色表各自独立', (mode, vars) => {
    for (const background of backgroundsOf(mode)) {
      expect(contrast(vars['--logansi-on-bg'], background)).toBeGreaterThanOrEqual(4.5);
    }
    // 复制色值到另一档是最容易犯的错：同一变量名在两档必须取值不同
    const other = mode === 'light' ? dark : light;
    expect(Object.keys(vars).sort()).toEqual(Object.keys(other).sort());
    for (const name of Object.keys(vars)) {
      if (name.startsWith('--logansi') && vars[name].startsWith('#')) {
        expect(vars[name], `${name} 两档取值相同`).not.toBe(other[name]);
      }
    }
  });

  it('两档都覆盖 8 个索引及其全部分组', () => {
    for (const [, vars] of MODES) {
      for (const prefix of PREFIXES) {
        expect(Object.keys(vars)).toEqual(expect.arrayContaining([`--logansi-${prefix}-0`, `--logansi-${prefix}-7`]));
      }
    }
  });
});
