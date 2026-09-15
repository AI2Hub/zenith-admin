/**
 * SQL 监控展示用脱敏：pg_stat_statements 通常已经归一化常量，但 pg_stat_activity
 * 仍可能包含原始参数；两条链路统一再清理字符串、数字、注释和 dollar-quoted 文本。
 */
export function scrubSqlText(input: string | null | undefined, maxChars = 2_000): string | null {
  if (input == null) return null;
  const source = String(input);
  const dollarQuoted = /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/g;
  let value = source
    .replace(dollarQuoted, '?')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|\\.|[^'])*'/g, '?')
    .replace(/\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '?')
    .replace(/\s+/g, ' ')
    .trim();

  // 不完整的字符串很可能来自截断或扩展语法，宁可隐藏也不把尾部原文展示出来。
  const quoteCount = (value.match(/'/g) ?? []).length;
  if (quoteCount % 2 !== 0) return '[SQL 已隐藏]';
  if (value.length > maxChars) value = `${value.slice(0, Math.max(0, maxChars - 1))}…`;
  return value || null;
}
