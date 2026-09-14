import { createHash } from 'node:crypto';

/** 第三方 / 运行时内部帧：不参与分组（同一根因经不同业务入口进入时它们完全相同，只会把不同问题并成一组） */
const NON_APP_FRAME_RE = /node_modules|node:internal|^node:|\binternal\/|<anonymous>$/;
/** `at fn (file:line:col)` / `at file:line:col` / `at async fn (…)` */
const FRAME_RE = /^at\s+(?:async\s+)?(?:(.+?)\s+\()?(.+?)(?::\d+)?(?::\d+)?\)?$/;

/**
 * 消息归一：十六进制 / UUID / 数字 → 占位符，压缩空白，限长。
 * 与前端 `computeErrorFingerprint` 同一口径；引号内字面量刻意保留（PG 约束名 / 列名是区分不同问题的关键）。
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(/0x[0-9a-f]+/gi, 'HEX')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** 文件路径去掉盘符 / 绝对前缀：应用代码留 `src/` 或 `dist/` 之后，依赖留 `node_modules/` 之后的包内路径；其余取末两段 */
function relativeFile(file: string): string {
  const clean = file.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const dep = clean.lastIndexOf('/node_modules/');
  if (dep >= 0) return clean.slice(dep + '/node_modules/'.length);
  const marker = clean.search(/\/(src|dist)\//);
  if (marker >= 0) return clean.slice(marker + 1);
  return clean.split('/').slice(-2).join('/');
}

/** 单帧 → `fn@relative/file`（去行列号；匿名帧只留文件） */
function frameKey(line: string): string | null {
  const match = FRAME_RE.exec(line);
  if (!match) return null;
  const fn = match[1]?.trim();
  const file = relativeFile(match[2].trim());
  return fn ? `${fn}@${file}` : file;
}

/**
 * 堆栈里的应用内帧（自上而下，最多 `limit` 个）；一个应用帧都没有时退回全部帧的前两帧——
 * 纯运行时 / 驱动内部抛出的错误也要能稳定分组。
 */
export function extractInAppFrames(stack: string | null | undefined, limit = 3): string[] {
  if (!stack) return [];
  // 只看第一段（cause 链之前）：cause 在 message 里已体现，其帧属于另一段代码路径
  const firstSection = stack.split(/\n(?:Caused by:|\[errors\[)/)[0];
  const lines = firstSection.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('at '));
  const inApp = lines.filter((l) => !NON_APP_FRAME_RE.test(l)).map(frameKey).filter((k): k is string => !!k);
  if (inApp.length > 0) return inApp.slice(0, limit);
  return lines.slice(0, 2).map(frameKey).filter((k): k is string => !!k);
}

export interface ServerFingerprintInput {
  readonly environment: string;
  readonly errorType: string;
  readonly errorName: string;
  readonly message: string;
  readonly stack: string | null;
  /** 显式分组：直接以其内容哈希 */
  readonly override?: readonly string[];
}

/**
 * 服务端异常指纹（md5 前 32 位，与前端指纹同长同列）：
 * `environment | errorType | errorName | 归一化消息 | 前 3 个应用内帧`。
 * 不含租户（同一 bug 多租户触发是一个 Issue）、不含路由（同一根因跨接口不拆组，路由只做筛选）；
 * 帧去行列号，部署改动不影响分组。
 */
export function computeServerFingerprint(input: ServerFingerprintInput): string {
  const raw = input.override && input.override.length > 0
    ? ['override', input.environment, ...input.override].join('|')
    : [input.environment, input.errorType, input.errorName, normalizeErrorMessage(input.message), ...extractInAppFrames(input.stack)].join('|');
  return createHash('md5').update(raw).digest('hex').slice(0, 32);
}
