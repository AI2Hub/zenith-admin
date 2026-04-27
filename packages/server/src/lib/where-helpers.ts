import { and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';

/** 合并两个可选的 WHERE 条件，等价于 `base && extra ? and(base, extra) : (extra ?? base)` */
export function mergeWhere(base?: SQL, extra?: SQL): SQL | undefined {
  if (base && extra) return and(base, extra);
  return extra ?? base;
}

/** 转义 PostgreSQL LIKE / ILIKE 元字符（%, _, \），防止用户输入被解释为通配符 */
export function escapeLike(s: string): string {
  return s.replaceAll(String.raw`%`, String.raw`\%`).replaceAll('_', String.raw`\_`).replaceAll('\\', String.raw`\\`);
}

/**
 * 为 `.$dynamic()` 查询添加分页（LIMIT + OFFSET），参考 Drizzle 官方 Dynamic Query 文档。
 * @see https://orm.drizzle.team/docs/dynamic-query-building
 *
 * @example
 * const [total, list] = await Promise.all([
 *   db.$count(table, where),
 *   withPagination(db.select().from(table).where(where).$dynamic(), page, pageSize),
 * ]);
 */
export function withPagination<T extends PgSelect>(qb: T, page: number, pageSize: number) {
  return qb.limit(pageSize).offset((page - 1) * pageSize);
}
