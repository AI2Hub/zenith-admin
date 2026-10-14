import { describe, expect, it } from 'vitest';
import { clearLogHighlightCache, tokenizeLogLine } from './log-highlight';

const PRIMARY = 'var(--logtok-key)';
const SUCCESS = 'var(--logtok-string)';
const WARNING = 'var(--logtok-number)';
const INFO = 'var(--logtok-literal)';
const PLAIN = 'var(--logtok-plain)';
const PUNCT = 'var(--logtok-punct)';

/** token 文本拼接必须恒等于原行：搜索区间按整行偏移映射的前提 */
function expectRoundTrip(line: string) {
  const tokens = tokenizeLogLine(line);
  expect(tokens).not.toBeNull();
  expect(tokens!.map((t) => t.text).join('')).toBe(line);
}

describe('tokenizeLogLine', () => {
  it('NDJSON 行：key / string / number / 字面量分别着色', () => {
    clearLogHighlightCache();
    const line = '{"level":50,"time":"2026-10-14T10:59:07.478+08:00","ok":true,"off":false,"nothing":null,"pid":42516}';
    const tokens = tokenizeLogLine(line);
    expect(tokens).not.toBeNull();
    expectRoundTrip(line);
    const byText = new Map(tokens!.map((t) => [t.text, t.color]));
    expect(byText.get('"level"')).toBe(PRIMARY);
    expect(byText.get('50')).toBe(WARNING);
    expect(byText.get('"2026-10-14T10:59:07.478+08:00"')).toBe(SUCCESS);
    expect(byText.get('true')).toBe(INFO);
    expect(byText.get('false')).toBe(INFO);
    expect(byText.get('null')).toBe(INFO);
    expect(byText.get('42516')).toBe(WARNING);
    expect(byText.get('{')).toBe(PUNCT);
    expect(byText.get(':')).toBe(PUNCT);
  });

  it('key 判定容忍冒号前的空白；转义引号不提前终结字符串', () => {
    const line = '{"msg" : "a\\"b", "n" : -12.5e+3}';
    const tokens = tokenizeLogLine(line)!;
    expect(tokens.map((t) => t.text).join('')).toBe(line);
    const byText = new Map(tokens.map((t) => [t.text, t.color]));
    expect(byText.get('"msg"')).toBe(PRIMARY);
    expect(byText.get('"a\\"b"')).toBe(SUCCESS);
    expect(byText.get('-12.5e+3')).toBe(WARNING);
  });

  it('非法 JSON 走 pretty 路径，不抛错且拼接恒等', () => {
    const line = '{"level":50, broken';
    expectRoundTrip(line);
  });

  it('pretty 行：行首时间戳变灰、k=v 键名与引号串着色', () => {
    const line = '[2026-10-14 10:59:07.478 +08:00] INFO (pid=42516): "hello" err=Error';
    const tokens = tokenizeLogLine(line)!;
    expect(tokens.map((t) => t.text).join('')).toBe(line);
    expect(tokens[0]).toMatchObject({ text: '[2026-10-14 10:59:07.478 +08:00]' });
    expect(tokens[0].color).toBe('var(--logtok-dim)');
    const byText = new Map(tokens.map((t) => [t.text, t.color]));
    expect(byText.get('pid')).toBe(PRIMARY);
    expect(byText.get('"hello"')).toBe(SUCCESS);
    expect(byText.get('err')).toBe(PRIMARY);
  });

  it('ISO 时间戳行首同样变灰；行中时间戳不误染', () => {
    const line = '2026-10-14T10:59:07.478+08:00 INFO ok at 2026-10-14T10:59:07.478+08:00';
    const tokens = tokenizeLogLine(line)!;
    expect(tokens.map((t) => t.text).join('')).toBe(line);
    expect(tokens[0]).toMatchObject({ text: '2026-10-14T10:59:07.478+08:00', color: 'var(--logtok-dim)' });
    // 行中第二个时间戳是普通文本（与前面正文合并为一个 plain token）
    expect(tokens[tokens.length - 1]).toMatchObject({ text: ' INFO ok at 2026-10-14T10:59:07.478+08:00', color: PLAIN });
  });

  it('超长行跳过着色返回 null', () => {
    const line = `{"msg":"${'x'.repeat(30_000)}"}`;
    expect(tokenizeLogLine(line)).toBeNull();
  });

  it('token 超限时合并剩余部分，拼接仍恒等', () => {
    // 大量短 kv 对把 token 数推过上限
    const pairs = Array.from({ length: 400 }, (_, i) => `"k${i}":${i}`).join(',');
    const line = `{${pairs}}`;
    expect(line.length).toBeLessThan(20_000);
    const tokens = tokenizeLogLine(line)!;
    expect(tokens.length).toBeLessThanOrEqual(500);
    expect(tokens.map((t) => t.text).join('')).toBe(line);
    expect(tokens[tokens.length - 1].color).toBe(PLAIN);
  });

  it('同行二次调用命中缓存（同一引用）', () => {
    const line = '{"level":30,"msg":"hi"}';
    expect(tokenizeLogLine(line)).toBe(tokenizeLogLine(line));
  });

  it('空行不抛错', () => {
    expect(tokenizeLogLine('')!.map((t) => t.text).join('')).toBe('');
  });
});
