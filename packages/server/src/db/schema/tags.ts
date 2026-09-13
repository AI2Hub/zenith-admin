import { pgTable, varchar, integer, text } from 'drizzle-orm/pg-core';
import { timestampColumns, idColumn, statusColumn } from './common';
import { auditColumns } from './core';

export const tags = pgTable('tags', {
  id:          idColumn(),
  name:        varchar({ length: 50 }).notNull().unique(),
  color:       varchar({ length: 20 }),
  groupName:   varchar({ length: 50 }),
  description: text(),
  status:      statusColumn(),
  sortOrder:   integer().notNull().default(0),
  ...auditColumns(),
  ...timestampColumns(),
});

export type TagRow = typeof tags.$inferSelect;

export type NewTag = typeof tags.$inferInsert;

// ─── 工作流引擎 ───────────────────────────────────────────────────────────────
