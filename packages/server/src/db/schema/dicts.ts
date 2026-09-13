import { pgTable, varchar, integer, unique, uniqueIndex, jsonb, type AnyPgColumn, index } from 'drizzle-orm/pg-core';
import { timestampColumns, idColumn, statusColumn, sortColumn, remarkColumn } from './common';
import { auditColumns, tenantIdColumn } from './core';

// ─── 字典表 ───────────────────────────────────────────────────────────────────
export const dicts = pgTable('dicts', {
  id: idColumn(),
  name: varchar({ length: 64 }).notNull(),
  code: varchar({ length: 64 }).notNull(),
  description: varchar({ length: 256 }),
  status: statusColumn(),
  tenantId: tenantIdColumn(),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [unique('dicts_tenant_code_unique').on(t.tenantId, t.code)]);

export type DictRow = typeof dicts.$inferSelect;

export type NewDict = typeof dicts.$inferInsert;

// ─── 字典项表 ─────────────────────────────────────────────────────────────────
export const dictItems = pgTable('dict_items', {
  id: idColumn(),
  dictId: integer().notNull().references(() => dicts.id, { onDelete: 'cascade' }),
  parentId: integer().references((): AnyPgColumn => dictItems.id, { onDelete: 'cascade' }),
  label: varchar({ length: 64 }).notNull(),
  value: varchar({ length: 64 }).notNull(),
  color: varchar({ length: 32 }),
  sort: sortColumn(),
  status: statusColumn(),
  remark: remarkColumn(),
  metadata: jsonb(),
  ...auditColumns(),
  ...timestampColumns(),
}, (table) => [index('dict_items_parent_idx').on(table.parentId), 
  uniqueIndex('dict_items_dict_id_value_unique').on(table.dictId, table.value),
]);

export type DictItemRow = typeof dictItems.$inferSelect;

export type NewDictItem = typeof dictItems.$inferInsert;
