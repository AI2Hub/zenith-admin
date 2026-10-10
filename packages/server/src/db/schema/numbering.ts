import { bigint, boolean, index, integer, jsonb, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';
import type { NumberingConfig } from '@zenith/shared/platform';
import { auditColumns, tenantIdColumn } from './core';
import { idColumn, statusColumn, timestampColumns, timestamptz } from './common';

export const numberingRules = pgTable('numbering_rules', {
  id: idColumn(),
  code: varchar({ length: 64 }).notNull(),
  name: varchar({ length: 100 }).notNull(),
  scene: varchar({ length: 64 }).notNull(),
  description: text(),
  tenantId: tenantIdColumn('restrict'),
  isBuiltin: boolean().notNull().default(false),
  status: statusColumn(),
  draft: jsonb().$type<NumberingConfig>().notNull(),
  revision: integer().notNull().default(1),
  currentVersion: integer().notNull().default(0),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [
  unique('numbering_rules_tenant_code_unique').on(t.tenantId, t.code).nullsNotDistinct(),
  index('numbering_rules_scene_idx').on(t.scene),
]);

export const numberingVersions = pgTable('numbering_versions', {
  id: idColumn(),
  ruleId: integer().notNull().references(() => numberingRules.id, { onDelete: 'restrict' }),
  version: integer().notNull(),
  config: jsonb().$type<NumberingConfig>().notNull(),
  ...auditColumns(),
  createdAt: timestamptz().defaultNow().notNull(),
}, (t) => [unique('numbering_versions_rule_version_unique').on(t.ruleId, t.version)]);

export const numberingBindings = pgTable('numbering_bindings', {
  id: idColumn(),
  scene: varchar({ length: 64 }).notNull(),
  ownerKey: varchar({ length: 128 }).notNull().default('*'),
  ruleId: integer().notNull().references(() => numberingRules.id, { onDelete: 'restrict' }),
  versionId: integer().notNull().references(() => numberingVersions.id, { onDelete: 'restrict' }),
  tenantId: tenantIdColumn('restrict'),
  parameterMapping: jsonb().$type<Record<string, string>>().notNull().default({}),
  ...auditColumns(),
  ...timestampColumns(),
}, (t) => [unique('numbering_bindings_scene_owner_tenant_unique').on(t.scene, t.ownerKey, t.tenantId).nullsNotDistinct()]);

// A sequence belongs to the stable rule, never to a published version.
export const numberingCounters = pgTable('numbering_counters', {
  id: idColumn(),
  ruleId: integer().notNull().references(() => numberingRules.id, { onDelete: 'restrict' }),
  scopeKey: varchar({ length: 256 }).notNull(),
  periodKey: varchar({ length: 16 }).notNull(),
  value: bigint({ mode: 'bigint' }).notNull(),
}, (t) => [unique('numbering_counters_rule_scope_period_unique').on(t.ruleId, t.scopeKey, t.periodKey)]);

// Permanent allocation receipts are the idempotency and uniqueness authority, not disposable logs.
export const numberingAllocations = pgTable('numbering_allocations', {
  id: idColumn(),
  scene: varchar({ length: 64 }).notNull(),
  tenantId: tenantIdColumn('restrict'),
  ownerKey: varchar({ length: 128 }).notNull(),
  allocationKey: varchar({ length: 200 }).notNull(),
  businessKey: varchar({ length: 128 }),
  ruleId: integer().notNull().references(() => numberingRules.id, { onDelete: 'restrict' }),
  versionId: integer().notNull().references(() => numberingVersions.id, { onDelete: 'restrict' }),
  number: varchar({ length: 128 }).notNull(),
  uniqueNamespace: varchar({ length: 64 }).notNull(),
  uniqueScope: varchar({ length: 256 }).notNull(),
  contextHash: varchar({ length: 64 }).notNull(),
  createdAt: timestamptz().defaultNow().notNull(),
}, (t) => [
  unique('numbering_allocations_operation_unique').on(t.scene, t.tenantId, t.ownerKey, t.allocationKey).nullsNotDistinct(),
  unique('numbering_allocations_number_unique').on(t.uniqueNamespace, t.uniqueScope, t.number),
  index('numbering_allocations_rule_created_idx').on(t.ruleId, t.createdAt),
]);

export type NumberingRuleRow = typeof numberingRules.$inferSelect;
export type NewNumberingRule = typeof numberingRules.$inferInsert;
export type NumberingVersionRow = typeof numberingVersions.$inferSelect;
export type NumberingBindingRow = typeof numberingBindings.$inferSelect;
export type NumberingAllocationRow = typeof numberingAllocations.$inferSelect;
