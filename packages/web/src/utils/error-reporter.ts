/**
 * 前端错误上报：统一构造 payload 并发送到 /api/frontend-errors。
 * 携带行为面包屑、会话 ID、发布版本，附带去重与限流保护。
 */
import { TOKEN_KEY } from '@zenith/shared';
import type { FrontendErrorType, ErrorLevel } from '@zenith/shared';
import { getBreadcrumbs } from './breadcrumbs';

const SESSION_KEY = 'zenith_tracker_sid';
let reportingPolicy = { ready: false, enabled: true, trackErrors: true, respectDnt: false };

export interface ReportErrorOptions {
  level?: ErrorLevel;
  stack?: string;
  sourceUrl?: string;
  lineNo?: number;
  colNo?: number;
  context?: Record<string, unknown>;
  httpStatus?: number;
  httpMethod?: string;
  httpUrl?: string;
}

/** 应用版本（用于 source map 还原与版本回归）。 */
export function getRelease(): string | undefined {
  return (import.meta.env.VITE_APP_VERSION as string) || undefined;
}

// 简单去重：相同 (type:message) 在 10s 内只上报一次
const recent = new Map<string, number>();
const DEDUP_TTL = 10_000;

export function configureErrorReporting(policy: Readonly<Omit<typeof reportingPolicy, 'ready'>>): void {
  reportingPolicy = { ready: true, ...policy };
}

function isReportingEnabled(): boolean {
  if (!reportingPolicy.ready || !reportingPolicy.enabled || !reportingPolicy.trackErrors) return false;
  if (reportingPolicy.respectDnt && (navigator.doNotTrack === '1' || (globalThis as { doNotTrack?: string }).doNotTrack === '1')) return false;
  return true;
}

export function reportError(errorType: FrontendErrorType, message: string, options?: ReportErrorOptions): void {
  try {
    if (!isReportingEnabled()) return;
    const token = localStorage.getItem(TOKEN_KEY);
    const key = `${errorType}:${message}`.slice(0, 200);
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUP_TTL) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();

    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || '/api';
    const sessionId = sessionStorage.getItem(SESSION_KEY) ?? undefined;

    const payload = {
      errorType,
      level: options?.level,
      message: message.slice(0, 2000),
      stack: options?.stack?.slice(0, 16_000),
      sourceUrl: options?.sourceUrl?.slice(0, 512),
      lineNo: options?.lineNo,
      colNo: options?.colNo,
      pageUrl: globalThis.location.href.slice(0, 512),
      release: getRelease(),
      sessionId,
      breadcrumbs: getBreadcrumbs(),
      context: options?.context,
      httpStatus: options?.httpStatus,
      httpMethod: options?.httpMethod,
      httpUrl: options?.httpUrl,
    };

    fetch(`${apiBase}/frontend-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* 监控自身错误不应影响应用 */ });
  } catch {
    /* never break the app */
  }
}
