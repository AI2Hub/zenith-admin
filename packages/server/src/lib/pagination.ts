/**
 * 计算分页查询的 offset 值，与 Drizzle ORM 的 .limit().offset() 配合使用
 *
 * @example
 * db.select().from(table).limit(pageSize).offset(pageOffset(page, pageSize))
 */
export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
