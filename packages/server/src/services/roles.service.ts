import { roles } from '../db/schema';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapRole(row: typeof roles.$inferSelect, menuIds?: number[]) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(menuIds === undefined ? {} : { menuIds }),
  };
}
