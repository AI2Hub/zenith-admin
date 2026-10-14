/**
 * 审计 payload 裁剪：把任意数据收敛为「体积有硬上界的合法 JSON 字符串」。
 *
 * operation_logs 的 before_data / after_data / request_body 是 text 列。
 * 不可直接截断序列化字符串，否则会产生非法 JSON；实体快照必须限大小，避免日志膨胀与 trgm 索引写放大。
 *
 * 策略：对象层面按「宽松 → 收紧 → 激进」三档降级裁剪，每档序列化后按 UTF-8
 * 字节实测；全部超标时落为不含原始值的摘要对象（体积有常数上界）。
 * 因此无论输入什么，返回值的字节数 ≤ budgetBytes 恒成立，且永远是合法 JSON。
 */

/** before/after 快照与响应体的默认预算 */
export const AUDIT_SNAPSHOT_BUDGET_BYTES = 16 * 1024;
/** 请求体预算（4KB 上界） */
export const AUDIT_REQUEST_BODY_BUDGET_BYTES = 4 * 1024;

const TRUNCATED_MARK = '…[截断]';

interface ClampLevel {
  maxStr: number;
  maxItems: number;
  maxKeys: number;
  maxDepth: number;
}

/** 逐级收紧的裁剪档位 */
const LEVELS: readonly ClampLevel[] = [
  { maxStr: 2048, maxItems: 50, maxKeys: 100, maxDepth: 8 },
  { maxStr: 512, maxItems: 20, maxKeys: 50, maxDepth: 6 },
  { maxStr: 128, maxItems: 5, maxKeys: 20, maxDepth: 3 },
];

function clampString(value: string, maxStr: number): string {
  return value.length > maxStr ? value.slice(0, maxStr) + TRUNCATED_MARK : value;
}

function clampByRules(value: unknown, level: ClampLevel, depth: number): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string') return clampString(value as string, level.maxStr);
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return String(value);
  if (type === 'function' || type === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (depth >= level.maxDepth) return '…[深度截断]';
  if (Array.isArray(value)) {
    const items = value.slice(0, level.maxItems).map((item) => clampByRules(item, level, depth + 1));
    if (value.length > level.maxItems) items.push(`…[截断 ${value.length - level.maxItems} 项]`);
    return items;
  }
  if (type === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const maxKeyLen = Math.min(level.maxStr, 256);
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(0, level.maxKeys)) {
      // 键名同样裁剪，防止超长键逃逸预算（截断后碰撞时后者覆盖，审计场景可接受）
      out[clampString(key, maxKeyLen)] = clampByRules((value as Record<string, unknown>)[key], level, depth + 1);
    }
    if (keys.length > level.maxKeys) out._truncatedKeys = keys.length - level.maxKeys;
    return out;
  }
  return String(value);
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    // 循环引用等异常：交给下一档或摘要兜底
    return undefined;
  }
}

/** 摘要兜底：不含任何原始值内容；超预算时逐级丢弃字段，保证硬上界 */
function summarize(data: unknown, originalBytes: number | null, budgetBytes: number): string {
  const summary: Record<string, unknown> = {
    _truncated: true,
    _type: Array.isArray(data) ? 'array' : typeof data,
    _bytes: originalBytes,
  };
  if (Array.isArray(data)) {
    summary._length = data.length;
  } else if (data && typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>);
    summary._keyCount = keys.length;
    summary._keys = keys.slice(0, 20).map((k) => k.slice(0, 64));
  } else if (typeof data === 'string') {
    summary._length = data.length;
  }
  let str = JSON.stringify(summary);
  if (Buffer.byteLength(str, 'utf8') > budgetBytes) {
    delete summary._keys;
    str = JSON.stringify(summary);
  }
  if (Buffer.byteLength(str, 'utf8') > budgetBytes) {
    str = JSON.stringify({ _truncated: true });
  }
  return str;
}

/**
 * 把任意数据裁剪为合法 JSON 字符串，UTF-8 字节数硬保证 ≤ budgetBytes。
 * 输入为 undefined（或 JSON 不可表示的顶层值）时返回 undefined，与
 * `JSON.stringify` 的语义一致，便于调用方沿用 `?? null` 入库。
 */
export function clampAuditJson(data: unknown, budgetBytes = AUDIT_SNAPSHOT_BUDGET_BYTES): string | undefined {
  if (data === undefined) return undefined;
  let originalBytes: number | null = null;
  for (const [i, level] of LEVELS.entries()) {
    const clamped = clampByRules(data, level, 0);
    const str = safeStringify(clamped);
    if (str === undefined) continue;
    if (i === 0) originalBytes = Buffer.byteLength(str, 'utf8');
    if (Buffer.byteLength(str, 'utf8') <= budgetBytes) return str;
  }
  return summarize(data, originalBytes, budgetBytes);
}

/**
 * 纯文本按 UTF-8 字节安全截断（不产生半个多字节字符），用于非 JSON 的响应体。
 * 返回值字节数 ≤ budgetBytes。
 */
export function sliceUtf8Text(text: string, budgetBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= budgetBytes) return text;
  const markBytes = Buffer.byteLength(TRUNCATED_MARK, 'utf8');
  const target = Math.max(0, budgetBytes - markBytes);
  // 字符数 ≤ 字节数，先粗切再按超出量回退，每轮至少退 1 字符，必然收敛
  let sliced = text.slice(0, target);
  let over = Buffer.byteLength(sliced, 'utf8') - target;
  while (over > 0 && sliced.length > 0) {
    sliced = sliced.slice(0, sliced.length - Math.max(1, Math.ceil(over / 4)));
    over = Buffer.byteLength(sliced, 'utf8') - target;
  }
  return sliced + TRUNCATED_MARK;
}
