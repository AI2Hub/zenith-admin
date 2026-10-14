/**
 * 日志行内语法着色：NDJSON 行的 key / string / number / 字面量，
 * 以及 pretty 文本行（pino-pretty 输出）的行首时间戳 / kv 键 / 引号串。
 *
 * 设计约束（见 LogContentView）：
 * - 只做行内切分，不改变文本：token 文本拼接必须恒等于原行，
 *   搜索 `<mark>` 区间按整行偏移映射到 token 上（与 ansi.ts 同一模型）。
 * - 单遍线性扫描，不用回溯型正则；超长行直接跳过（返回 null 走纯文本）。
 * - 按行内容缓存：虚拟列表滚动会反复重渲染可见行，不能每次重扫。
 */

export interface LogToken {
  text: string;
  /** 文本颜色（CSS 颜色）；缺省用普通正文色 */
  color?: string;
}

const TOKEN_PLAIN = 'var(--logtok-plain)';
const TOKEN_KEY = 'var(--logtok-key)';
const TOKEN_STRING = 'var(--logtok-string)';
const TOKEN_NUMBER = 'var(--logtok-number)';
const TOKEN_LITERAL = 'var(--logtok-literal)';
const TOKEN_PUNCT = 'var(--logtok-punct)';
const TOKEN_DIM = 'var(--logtok-dim)';

/** 超过该长度的行跳过着色（SQL 长行），直接纯文本渲染，避免几千个 span */
const MAX_HIGHLIGHT_CHARS = 20_000;
/** 单行 token 上限：超出后剩余部分合并为一个纯文本 token */
const MAX_TOKENS = 500;
/** 行缓存上限：FIFO 淘汰最早写入的行 */
const CACHE_LIMIT = 2000;

const cache = new Map<string, LogToken[] | null>();

function isJsonLine(line: string): boolean {
  if (!line.trimStart().startsWith('{')) return false;
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/** token 数超限时只保留前 N-1 个，剩余原文合并为一个纯文本 token */
function capTokens(line: string, tokens: LogToken[]): LogToken[] {
  if (tokens.length <= MAX_TOKENS) return tokens;
  const kept = tokens.slice(0, MAX_TOKENS - 1);
  const used = kept.reduce((n, t) => n + t.text.length, 0);
  kept.push({ text: line.slice(used), color: TOKEN_PLAIN });
  return kept;
}

/** NDJSON 单行扫描：字符串（含 key 判定）/ 数字 / 字面量 / 标点，其余原样 */
function tokenizeJson(line: string): LogToken[] {
  const tokens: LogToken[] = [];
  let chunk = '';
  let chunkColor: string | undefined;
  const push = (text: string, color: string | undefined) => {
    if (color === chunkColor) {
      chunk += text;
      return;
    }
    if (chunk) tokens.push({ text: chunk, color: chunkColor });
    chunk = text;
    chunkColor = color;
  };
  const flush = () => {
    if (chunk) tokens.push({ text: chunk, color: chunkColor });
    chunk = '';
    chunkColor = undefined;
  };

  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    // 空白：合并为普通文本
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      let j = i + 1;
      while (j < n && (line[j] === ' ' || line[j] === '\t' || line[j] === '\r' || line[j] === '\n')) j++;
      push(line.slice(i, j), TOKEN_PLAIN);
      i = j;
      continue;
    }
    // 标点
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':') {
      push(ch, TOKEN_PUNCT);
      i++;
      continue;
    }
    // 字符串：处理转义；其后（隔空白）是冒号即为 key
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '"') break;
        j++;
      }
      const end = j < n ? j + 1 : n;
      let k = end;
      while (k < n && line[k] === ' ') k++;
      push(line.slice(i, end), line[k] === ':' ? TOKEN_KEY : TOKEN_STRING);
      i = end;
      continue;
    }
    // 数字（含负号 / 小数 / 指数）
    if ((ch >= '0' && ch <= '9') || (ch === '-' && i + 1 < n && line[i + 1] >= '0' && line[i + 1] <= '9')) {
      const rest = line.slice(i);
      const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
      if (num) {
        push(num[0], TOKEN_NUMBER);
        i += num[0].length;
        continue;
      }
    }
    // 字面量：true / false / null（后跟分隔符才算，避免把不合法输入误染）
    if (line.startsWith('true', i) || line.startsWith('null', i)) {
      const word = line.startsWith('true', i) ? 'true' : 'null';
      const after = line[i + word.length];
      if (after === undefined || /[\s,{}\]:]/.test(after)) {
        push(word, TOKEN_LITERAL);
        i += word.length;
        continue;
      }
    }
    if (line.startsWith('false', i)) {
      const after = line[i + 5];
      if (after === undefined || /[\s,{}\]:]/.test(after)) {
        push('false', TOKEN_LITERAL);
        i += 5;
        continue;
      }
    }
    // 兜底：非法 JSON 内容逐字原样保留（拼接恒等是搜索偏移的前提）
    push(ch, TOKEN_PLAIN);
    i++;
  }
  flush();
  return capTokens(line, tokens);
}

/** 行首时间戳：`[2026-10-14 10:59:07.478 +08:00]` 或 `2026-10-14T10:59:07…`，只认行首 */
const PRETTY_TS_RE = /^(?:\[[^\]\n]{1,64}\]|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}(?::?\d{2})?)?)/;
/**
 * `"key":` / `k=` 的键名 + 独立引号串。单遍 g 匹配、无嵌套量词；
 * 未命中部分原样保留为普通文本。
 */
const PRETTY_KV_RE = /"((?:[^"\\\n]|\\.)*)"\s*:|([A-Za-z_$][\w$.-]*)=|"((?:[^"\\\n]|\\.)*)"/g;

/** pretty 文本行：时间戳变灰、kv 键与引号串着色 */
function tokenizePretty(line: string): LogToken[] {
  const tokens: LogToken[] = [];
  let pos = 0;
  const ts = PRETTY_TS_RE.exec(line);
  if (ts) {
    tokens.push({ text: ts[0], color: TOKEN_DIM });
    pos = ts[0].length;
  }
  PRETTY_KV_RE.lastIndex = pos;
  for (;;) {
    const m = PRETTY_KV_RE.exec(line);
    if (!m || m.index < pos) break;
    if (m.index > pos) tokens.push({ text: line.slice(pos, m.index), color: TOKEN_PLAIN });
    if (m[1] !== undefined) {
      // `"key":`：键名着色，冒号及空白作标点
      const keyEnd = m.index + 1 + m[1].length + 1;
      tokens.push({ text: line.slice(m.index, keyEnd), color: TOKEN_KEY });
      if (keyEnd < m.index + m[0].length) tokens.push({ text: line.slice(keyEnd, m.index + m[0].length), color: TOKEN_PUNCT });
    } else if (m[2] !== undefined) {
      // `k=`：键名着色，`=` 作标点
      tokens.push({ text: m[2], color: TOKEN_KEY });
      tokens.push({ text: '=', color: TOKEN_PUNCT });
    } else {
      tokens.push({ text: m[0], color: TOKEN_STRING });
    }
    pos = m.index + m[0].length;
    // 零宽保护：该正则恒消费至少一个字符，理论上不会空转
    if (m[0].length === 0) { pos++; PRETTY_KV_RE.lastIndex = pos; }
  }
  if (pos < line.length) tokens.push({ text: line.slice(pos), color: TOKEN_PLAIN });
  if (tokens.length === 0) tokens.push({ text: line, color: TOKEN_PLAIN });
  return capTokens(line, tokens);
}

/**
 * 切分一行用于着色。返回 null 表示跳过着色（超长行），调用方走纯文本渲染。
 * 结果按行内容缓存；token 文本拼接恒等于原行。
 */
export function tokenizeLogLine(line: string): LogToken[] | null {
  const hit = cache.get(line);
  if (hit !== undefined || cache.has(line)) return hit ?? null;
  let tokens: LogToken[] | null = null;
  if (line.length <= MAX_HIGHLIGHT_CHARS) {
    tokens = isJsonLine(line) ? tokenizeJson(line) : tokenizePretty(line);
  }
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(line, tokens);
  return tokens;
}

/** 测试与调试用：清空行缓存 */
export function clearLogHighlightCache(): void {
  cache.clear();
}
