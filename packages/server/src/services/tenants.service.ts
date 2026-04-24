import { tenants } from '../db/schema';

export function mapTenant(row: typeof tenants.$inferSelect) {
  return {
    ...row,
    expireAt: row.expireAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
