/** 行内语义分词，不改变原文；颜色由日志查看器的局部配色决定。 */
export type LogTokenKind = 'plain' | 'key' | 'string' | 'number' | 'literal' | 'punct' | 'dim';

export interface LogToken {
  text: string;
  kind: LogTokenKind;
}

const MAX_HIGHLIGHT_CHARS = 20_000;
const MAX_TOKENS = 500;
const CACHE_LIMIT = 2000;
// 按文本长度与 token 开销同时约束缓存，避免持续追踪把长日志常驻内存。
const CACHE_BUDGET = 2_000_000;
const cache = new Map<string, { tokens: LogToken[]; cost: number }>();
let cacheCost = 0;

function isJsonLine(line: string): boolean {
  if (!/^\s*[[{]/.test(line)) return false;
  try { JSON.parse(line); return true; } catch { return false; }
}

const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
const isKeyStart = (ch: string) => /[A-Za-z_$]/.test(ch);
const isKeyChar = (ch: string) => /[\w$.-]/.test(ch);
const JSON_NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
// 方括号必须以日期 / 时间开头，不能把 [ERROR]、[WARN] 当时间戳。
const PRETTY_TIMESTAMP = /^(?:\[(?:\d{4}-\d{2}-\d{2}[T ]|\d{2}:\d{2}:)[^\]\n]{1,48}\]|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)/;

function quotedEnd(line: string, start: number): number {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === '"') return i + 1;
    i++;
  }
  return line.length;
}

/** 单向游标扫描，达到 token 上限立即保留剩余原文，不先分词再截断。 */
function tokenize(line: string): LogToken[] {
  const json = isJsonLine(line);
  const tokens: LogToken[] = [];
  const push = (start: number, end: number, kind: LogTokenKind) => {
    const text = line.slice(start, end);
    const prev = tokens.at(-1);
    if (prev?.kind === kind) prev.text += text;
    else tokens.push({ text, kind });
  };
  let i = 0;
  if (!json) {
    const timestamp = PRETTY_TIMESTAMP.exec(line);
    if (timestamp) { i = timestamp[0].length; push(0, i, 'dim'); }
  }
  while (i < line.length) {
    if (tokens.length >= MAX_TOKENS - 2) { push(i, line.length, 'plain'); break; }
    const start = i;
    const ch = line[i];
    if (ch === '"') {
      i = quotedEnd(line, i);
      let next = i;
      while (next < line.length && isSpace(line[next])) next++;
      push(start, i, line[next] === ':' ? 'key' : 'string');
    } else if (json && '{}[],:'.includes(ch)) {
      i++;
      push(start, i, 'punct');
    } else if (json && (ch === '-' || (ch >= '0' && ch <= '9'))) {
      JSON_NUMBER.lastIndex = i;
      const number = JSON_NUMBER.exec(line);
      i += number?.[0].length ?? 1;
      push(start, i, number ? 'number' : 'plain');
    } else if (json && (ch === 't' || ch === 'f' || ch === 'n')) {
      const word = ch === 't' ? 'true' : ch === 'f' ? 'false' : 'null';
      i += word.length; // JSON.parse 已保证合法
      push(start, i, 'literal');
    } else if (!json && isKeyStart(ch)) {
      // 一次跳过整个候选键；无等号时不在后续每个字符上重试长正则。
      while (i < line.length && isKeyChar(line[i])) i++;
      const isKey = line[i] === '=';
      push(start, i, isKey ? 'key' : 'plain');
      if (isKey) { push(i, i + 1, 'punct'); i++; }
    } else {
      i++;
      push(start, i, 'plain');
    }
  }
  return tokens.length ? tokens : [{ text: line, kind: 'plain' }];
}

/** 超长行直接跳过且不缓存；LRU 结果与主题无关，切换配色无需重新分词。 */
export function tokenizeLogLine(line: string): LogToken[] | null {
  if (line.length > MAX_HIGHLIGHT_CHARS) return null;
  const hit = cache.get(line);
  if (hit) {
    cache.delete(line);
    cache.set(line, hit);
    return hit.tokens;
  }
  const tokens = tokenize(line);
  const cost = line.length + tokens.length * 64;
  while (cache.size && (cache.size >= CACHE_LIMIT || cacheCost + cost > CACHE_BUDGET)) {
    const oldest = cache.entries().next().value!;
    cacheCost -= oldest[1].cost;
    cache.delete(oldest[0]);
  }
  cache.set(line, { tokens, cost });
  cacheCost += cost;
  return tokens;
}

export function clearLogHighlightCache(): void {
  cache.clear();
  cacheCost = 0;
}
