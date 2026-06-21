import { HTTPException } from 'hono/http-exception';

export const PG_ERROR_CODES = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
} as const;

export function getPgErrorCode(error: unknown): string | undefined {
  // Drizzle 将底层 pg 错误包装为 DrizzleQueryError，真实错误码位于 cause 链上，
  // 故沿 cause 链向下查找第一个字符串型 code。
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isPgError(error: unknown, code: string): boolean {
  return getPgErrorCode(error) === code;
}

export function isPgUniqueViolation(error: unknown): boolean {
  return isPgError(error, PG_ERROR_CODES.uniqueViolation);
}

/**
 * 将 PostgreSQL 唯一约束冲突统一映射为业务错误，其他错误原样抛出。
 */
export function rethrowPgUniqueViolation(error: unknown, message: string): never {
  if (isPgUniqueViolation(error)) throw new HTTPException(400, { message: message });
  throw error;
}