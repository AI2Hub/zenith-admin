/**
 * 计算分页 offset，用于 RQB（Relational Query Builder）的 `findMany({ limit, offset })` 参数。
 *
 * 对于 SQL-builder 风格的查询（`db.select().from(...)`），请使用
 * `withPagination(query.$dynamic(), page, pageSize)`（来自 `lib/where-helpers`）。
 *
 * @example
 * db.query.users.findMany({ limit: pageSize, offset: pageOffset(page, pageSize) })
 */
export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
