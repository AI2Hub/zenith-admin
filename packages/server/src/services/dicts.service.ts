import { dicts, dictItems } from '../db/schema';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapDict(row: typeof dicts.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function mapDictItem(row: typeof dictItems.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
