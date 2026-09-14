import { describe, expect, it } from 'vitest';
import { ensurePinyin, isPinyinReady, textMatches } from './pinyin';

describe('textMatches', () => {
  it('matches by case-insensitive substring before the dictionary is loaded and treats blank queries as a hit', () => {
    expect(textMatches('单行文本', '')).toBe(true);
    expect(textMatches('单行文本', '  ')).toBe(true);
    expect(textMatches('单行文本', '文本')).toBe(true);
    expect(textMatches('NPS 量表', 'nps')).toBe(true);
    expect(textMatches('单行文本', '数字')).toBe(false);
  });

  it('adds pinyin initials / full-pinyin prefix matching once the dictionary is ready', async () => {
    await ensurePinyin();
    expect(isPinyinReady()).toBe(true);
    // 首字母
    expect(textMatches('单行文本', 'dhwb')).toBe(true);
    // 全拼前缀
    expect(textMatches('单行文本', 'danhang')).toBe(true);
    // 首字母 + 全拼混合
    expect(textMatches('下拉单选', 'xldx')).toBe(true);
    // start 精度按「每个字的拼音从开头匹配」，可从任意字起：wb 命中「文本」
    expect(textMatches('单行文本', 'wb')).toBe(true);
    // 拼音中段不算命中
    expect(textMatches('单行文本', 'anhang')).toBe(false);
    expect(textMatches('单行文本', 'shuzi')).toBe(false);
  });
});
