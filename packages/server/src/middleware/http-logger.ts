/**
 * HTTP 入站请求日志中间件
 *
 * 通过 Hono 中间件拦截进入本系统的所有 HTTP 请求，
 * 按配置记录请求/响应的 headers 和 body。
 *
 * 配置项（详见 config.httpLog.incoming）：
 *  - enabled:        全局开关
 *  - level:          默认级别（off / access / headers / body / full）
 *  - methods:        方法级别覆盖（优先于全局级别）
 *  - format:         输出格式（json / text / curl）
 *  - maxBodyBytes:   body 截断阈值
 *  - logResponseBody:是否捕获响应体（需克隆 Response）
 *  - excludePaths:   不记录的路径前缀
 *  - separateFile:   是否写入独立的 http-traffic.*.log
 *
 * 路由级覆盖：
 *  - 使用 withHttpLog(level) 工具中间件覆盖全局级别（仅对当前路由生效）
 *  - 示例：middleware: [authMiddleware, withHttpLog('full')] as const
 *
 * 安全说明：
 *  - 请求 body 中的敏感字段（password / secret / token 等）自动脱敏
 *  - Authorization、Cookie 等敏感 Header 自动替换为 "***"
 */

import { createMiddleware } from 'hono/factory';
import { formatDateTime } from '../lib/datetime';
import { config } from '../config';
import type { HttpLogLevel } from '../config';
import {
  resolveLevel,
  headersToRecord,
  redactHeaders,
  truncateBody,
  tryParseJson,
  safeRedactBody,
  writeHttpLogEntry,
  type HttpLogEntry,
} from '../lib/http-logger';

/** 内置排除路径（不记录流量的"基础设施"接口） */
const BUILTIN_EXCLUDE_PREFIXES = [
  '/api/health',
  '/api/ws',
  '/api/metrics',
  '/docs',
  '/api/ui',
  '/favicon.ico',
];

/** 不尝试读取 body 的 HTTP 方法（规范上不携带请求体） */
const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 请求目标（路径 + 查询串）的记录上限：查询串可能是大体积筛选条件，避免单行无限膨胀 */
const MAX_URL_LENGTH = 2048;

/**
 * 路由级 HTTP 日志级别覆盖工具中间件。
 *
 * 放置在路由的 `middleware` 数组中，可以为该路由单独指定日志级别，
 * 优先级高于全局配置和方法级配置。
 *
 * @example
 * ```typescript
 * // 仅对这个路由开启全量日志（全局配置为 access 也不影响）
 * middleware: [authMiddleware, withHttpLog('full')] as const
 *
 * // 对敏感路由关闭日志记录
 * middleware: [authMiddleware, withHttpLog('off')] as const
 * ```
 */
export function withHttpLog(level: HttpLogLevel) {
  return createMiddleware(async (c, next) => {
    c.set('httpLogLevel', level);
    await next();
  });
}

/** 上下文中存储路由级日志级别覆盖的 key */
const HTTP_LOG_LEVEL_KEY = 'httpLogLevel';

export const httpLoggerMiddleware = createMiddleware(async (c, next) => {
  const inCfg = config.httpLog.incoming;

  // ─── 快速路径：关闭时不做任何处理 ─────────────────────────────────────────
  if (!inCfg.enabled) {
    await next();
    return;
  }

  const path = c.req.path;

  // ─── 排除路径检查 ────────────────────────────────────────────────────────
  const excludeList = [...BUILTIN_EXCLUDE_PREFIXES, ...inCfg.excludePaths];
  if (excludeList.some((p) => path.startsWith(p))) {
    await next();
    return;
  }

  // ─── 请求目标：路径 + 查询串 ────────────────────────────────────────────
  // 排除判断只用 path（防止 `?next=/api/health` 之类绕过）；但记录时必须带上查询串：
  // GET 不携带请求体，查询参数就是它的「请求数据」，只记 path 会让这类请求在日志里
  // 看起来没有任何入参（与异常采集的 `c.req.url` 口径对齐）。
  const searchIndex = c.req.url.indexOf('?');
  const requestTarget = (searchIndex === -1 ? path : `${path}${c.req.url.slice(searchIndex)}`)
    .slice(0, MAX_URL_LENGTH);

  const method = c.req.method.toUpperCase();
  const startedAt = Date.now();
  const requestTimestamp = formatDateTime(new Date());

  // ─── 预先收集请求数据（Hono 会缓存 body，后续路由 handler 仍可读取）────────
  // 注意：此时还不知道最终日志级别（可能被路由中间件覆盖），
  //       但数据必须在 body 流被消费前读取，因此先全量收集，后续按级别筛选。
  let rawRequestBody: unknown;

  const ct = c.req.header('content-type') ?? '';
  if (!NO_BODY_METHODS.has(method) && ct.includes('application/json')) {
    try {
      rawRequestBody = await c.req.json<unknown>();
    } catch {
      // 读取失败（非 JSON 或空 body），跳过
    }
  }
  const rawRequestHeaders = headersToRecord(c.req.raw.headers);

  // ─── 执行路由处理器（路由级覆盖在此期间写入 context）───────────────────────
  await next();

  // ─── 确定最终日志级别（路由覆盖 > 方法覆盖 > 全局默认）────────────────────
  const routeOverride = c.get(HTTP_LOG_LEVEL_KEY) as HttpLogLevel | undefined;
  const level = routeOverride ?? resolveLevel(method, inCfg.level, inCfg.methods);

  if (level === 'off') return;

  const durationMs = Date.now() - startedAt;
  const correlation = (c.get('requestId') as string | undefined) ?? `gen-${startedAt}`;

  // ─── 构造并写入请求日志条目 ──────────────────────────────────────────────
  const reqEntry: HttpLogEntry = {
    correlation,
    direction: 'incoming',
    phase: 'request',
    method,
    url: requestTarget,
    requestHeaders: (level === 'headers' || level === 'full')
      ? redactHeaders(rawRequestHeaders)
      : undefined,
    requestBody: (level === 'body' || level === 'full') && rawRequestBody !== undefined
      ? truncateBody(safeRedactBody(rawRequestBody), inCfg.maxBodyBytes)
      : undefined,
    timestamp: requestTimestamp,
  };

  writeHttpLogEntry(reqEntry, inCfg.format, inCfg.separateFile);

  // ─── 构造并写入响应日志条目 ──────────────────────────────────────────────
  let responseHeaders: Record<string, string> | undefined;
  let responseBody: unknown;

  if (level === 'headers' || level === 'full') {
    responseHeaders = headersToRecord(c.res.headers);
  }

  if (inCfg.logResponseBody && (level === 'body' || level === 'full')) {
    const resCt = c.res.headers.get('content-type') ?? '';
    if (resCt.includes('application/json')) {
      try {
        const text = await c.res.clone().text();
        responseBody = truncateBody(tryParseJson(text), inCfg.maxBodyBytes);
      } catch {
        // 读取失败，跳过
      }
    }
  }

  const resEntry: HttpLogEntry = {
    correlation,
    direction: 'incoming',
    phase: 'response',
    method,
    url: requestTarget,
    statusCode: c.res.status,
    durationMs,
    responseHeaders,
    responseBody,
    timestamp: formatDateTime(new Date()),
  };

  writeHttpLogEntry(resEntry, inCfg.format, inCfg.separateFile);
});
