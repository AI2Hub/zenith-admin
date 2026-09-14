import type { NormalizedError } from './types';

const MESSAGE_MAX = 2000;
const STACK_MAX = 16_384;
const CAUSE_DEPTH_MAX = 5;

/** PG（postgres.js）错误对象上值得留下的字段 */
const PG_DETAIL_KEYS = ['detail', 'hint', 'constraint_name', 'constraint', 'table_name', 'table', 'column_name', 'column', 'schema_name', 'severity', 'routine'] as const;
/** Node 系统错误字段 */
const SYS_DETAIL_KEYS = ['syscall', 'errno', 'address', 'port', 'path', 'hostname'] as const;

function pickDetails(err: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (err as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    out[key] = value;
  }
  return out;
}

function errorName(err: Error): string {
  if (err.name && err.name !== 'Error') return err.name;
  const ctor = err.constructor?.name;
  return ctor && ctor !== 'Object' ? ctor : 'Error';
}

function errorCode(err: object): string | null {
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) return code.slice(0, 64);
  if (typeof code === 'number' && Number.isFinite(code)) return String(code);
  return null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'symbol' || typeof value === 'function' || typeof value === 'bigint') return String(value);
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function formatSingle(err: Error): string {
  return err.stack && err.stack.includes(err.message.slice(0, 40)) ? err.stack : `${errorName(err)}: ${err.message}\n${err.stack ?? ''}`.trimEnd();
}

/**
 * 含 cause 链与 AggregateError 子错误的完整堆栈：
 * `Error: x\n at …\nCaused by: TypeError: y\n at …`；深度与总长度有上限，循环引用安全。
 */
function formatStack(err: Error): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  let depth = 0;
  while (current instanceof Error && !seen.has(current) && depth <= CAUSE_DEPTH_MAX) {
    seen.add(current);
    parts.push(depth === 0 ? formatSingle(current) : `Caused by: ${formatSingle(current)}`);
    if (current instanceof AggregateError) {
      current.errors.slice(0, 5).forEach((inner, index) => {
        parts.push(`[errors[${index}]] ${inner instanceof Error ? formatSingle(inner) : stringifyUnknown(inner)}`);
      });
    }
    current = current.cause;
    depth += 1;
  }
  return parts.join('\n').slice(0, STACK_MAX);
}

/** 任意 thrown 值 → 结构化异常。非 Error 值以 `NonError` 记录其字符串形态。 */
export function normalizeThrown(cause: unknown): NormalizedError {
  if (cause instanceof Error) {
    const details = { ...pickDetails(cause, PG_DETAIL_KEYS), ...pickDetails(cause, SYS_DETAIL_KEYS) };
    // ZodError：issues 量化即可，逐条 issue 进 details 会把请求体内容带出来
    const issues = (cause as { issues?: unknown }).issues;
    if (Array.isArray(issues)) details.issueCount = issues.length;
    return {
      name: errorName(cause).slice(0, 128),
      message: (cause.message || errorName(cause)).slice(0, MESSAGE_MAX),
      code: errorCode(cause),
      stack: formatStack(cause) || null,
      details: Object.keys(details).length > 0 ? details : null,
    };
  }
  const text = stringifyUnknown(cause).slice(0, MESSAGE_MAX);
  return { name: 'NonError', message: text, code: null, stack: null, details: null };
}
