/**
 * 统一退避策略。
 *
 * 统一各处的退避规律为一处可配置策略：指数退避 base·2^(attempt-1)，封顶 maxMs。
 */

const DEFAULT_BASE_MS = 30_000; // 30s
const DEFAULT_MAX_MS = 15 * 60_000; // 15min
const MAX_EXP = 6; // 2^6 = 64x，避免溢出

/**
 * 计算下一次重试的等待毫秒数。
 * @param attempt 已用尝试次数（1-based）
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number = DEFAULT_BASE_MS,
  maxMs: number = DEFAULT_MAX_MS,
): number {
  const exp = Math.min(MAX_EXP, Math.max(0, attempt - 1));
  return Math.min(maxMs, baseMs * 2 ** exp);
}

/** 计算下一次重试的绝对时间 */
export function computeNextRunAt(
  attempt: number,
  from: Date = new Date(),
  baseMs?: number,
  maxMs?: number,
): Date {
  return new Date(from.getTime() + computeBackoffMs(attempt, baseMs, maxMs));
}
