import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid as pgUuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  REPORT_ACL_ROLES,
  REPORT_ACL_SUBJECT_TYPES,
  REPORT_APPROVAL_STATUSES,
  REPORT_ASSET_TEMPLATE_TYPES,
  REPORT_CHATBI_MESSAGE_ROLES,
  REPORT_CHATBI_SESSION_STATUSES,
  REPORT_DQ_ANOMALY_STATUSES,
  REPORT_DQ_RULE_TYPES,
  REPORT_DQ_RUN_STATUSES,
  REPORT_DQ_SEVERITIES,
  REPORT_ENVIRONMENT_KINDS,
  REPORT_FILL_RECORD_STATUSES,
  REPORT_FILL_SYNC_STATUSES,
  REPORT_FILL_TEMPLATE_STATUSES,
  REPORT_MATERIALIZATION_STRATEGIES,
  REPORT_METRIC_LIFECYCLE_STATUSES,
  REPORT_METRIC_TYPES,
  REPORT_PROMOTION_STATUSES,
  REPORT_QUOTA_SCOPES,
  REPORT_SLA_TYPES,
  REPORT_SLA_VIOLATION_STATUSES,
  REPORT_SNAPSHOT_STATUSES,
  REPORT_TRANSFER_STATUSES,
  type ReportChatbiChartSuggestion,
  type ReportChatbiContextSnapshot,
  type ReportDataResult,
  type ReportDqRuleConfig,
  type ReportNotifyChannel,
  type WorkflowFormSchema,
} from '@zenith/shared';
import { statusEnum } from './common';
import { auditColumns, tenants, users } from './core';
import { managedFiles } from './files';
import {
  reportDatasets,
  reportDashboards,
  reportDatasources,
  reportFolders,
  reportResourceTypeEnum,
} from './report';
import { workflowDefinitions, workflowInstances } from './workflow';

export const reportMetricTypeEnum = pgEnum('report_metric_type', REPORT_METRIC_TYPES);
export const reportMetricLifecycleStatusEnum = pgEnum('report_metric_lifecycle_status', REPORT_METRIC_LIFECYCLE_STATUSES);
export const reportAclSubjectTypeEnum = pgEnum('report_acl_subject_type', REPORT_ACL_SUBJECT_TYPES);
export const reportAclRoleEnum = pgEnum('report_acl_role', REPORT_ACL_ROLES);
export const reportApprovalStatusEnum = pgEnum('report_approval_status', REPORT_APPROVAL_STATUSES);
export const reportTransferStatusEnum = pgEnum('report_transfer_status', REPORT_TRANSFER_STATUSES);
export const reportEnvironmentKindEnum = pgEnum('report_environment_kind', REPORT_ENVIRONMENT_KINDS);
export const reportPromotionStatusEnum = pgEnum('report_promotion_status', REPORT_PROMOTION_STATUSES);
export const reportDqRuleTypeEnum = pgEnum('report_dq_rule_type', REPORT_DQ_RULE_TYPES);
export const reportDqSeverityEnum = pgEnum('report_dq_severity', REPORT_DQ_SEVERITIES);
export const reportDqRunStatusEnum = pgEnum('report_dq_run_status', REPORT_DQ_RUN_STATUSES);
export const reportDqAnomalyStatusEnum = pgEnum('report_dq_anomaly_status', REPORT_DQ_ANOMALY_STATUSES);
export const reportMaterializationStrategyEnum = pgEnum('report_materialization_strategy', REPORT_MATERIALIZATION_STRATEGIES);
export const reportSnapshotStatusEnum = pgEnum('report_snapshot_status', REPORT_SNAPSHOT_STATUSES);
export const reportQuotaScopeEnum = pgEnum('report_quota_scope', REPORT_QUOTA_SCOPES);
export const reportSlaTypeEnum = pgEnum('report_sla_type', REPORT_SLA_TYPES);
export const reportSlaViolationStatusEnum = pgEnum('report_sla_violation_status', REPORT_SLA_VIOLATION_STATUSES);
export const reportAssetTemplateTypeEnum = pgEnum('report_asset_template_type', REPORT_ASSET_TEMPLATE_TYPES);
export const reportChatbiSessionStatusEnum = pgEnum('report_chatbi_session_status', REPORT_CHATBI_SESSION_STATUSES);
export const reportChatbiMessageRoleEnum = pgEnum('report_chatbi_message_role', REPORT_CHATBI_MESSAGE_ROLES);
export const reportFillTemplateStatusEnum = pgEnum('report_fill_template_status', REPORT_FILL_TEMPLATE_STATUSES);
export const reportFillRecordStatusEnum = pgEnum('report_fill_record_status', REPORT_FILL_RECORD_STATUSES);
export const reportFillSyncStatusEnum = pgEnum('report_fill_sync_status', REPORT_FILL_SYNC_STATUSES);

export const reportMetrics = pgTable('report_metrics', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  folderId: integer('folder_id').references(() => reportFolders.id, { onDelete: 'set null' }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  type: reportMetricTypeEnum('type').notNull(),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'restrict' }),
  sourceField: varchar('source_field', { length: 128 }),
  formula: text('formula'),
  aggregate: varchar('aggregate', { length: 32 }),
  dimensions: jsonb('dimensions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  timeField: varchar('time_field', { length: 128 }),
  unit: varchar('unit', { length: 32 }),
  format: varchar('format', { length: 128 }),
  caliber: text('caliber'),
  lifecycleStatus: reportMetricLifecycleStatusEnum('lifecycle_status').notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  publishedSnapshot: jsonb('published_snapshot').$type<Record<string, unknown> | null>(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: integer('published_by').references(() => users.id, { onDelete: 'set null' }),
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  deprecatedBy: integer('deprecated_by').references(() => users.id, { onDelete: 'set null' }),
  deprecationReason: varchar('deprecation_reason', { length: 500 }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_metrics_tenant_code_uq').on(t.tenantId, t.code).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_metrics_global_code_uq').on(t.code).where(sql`${t.tenantId} is null`),
  index('report_metrics_tenant_lifecycle_idx').on(t.tenantId, t.lifecycleStatus),
  index('report_metrics_dataset_idx').on(t.datasetId),
  index('report_metrics_folder_idx').on(t.folderId),
  index('report_metrics_owner_idx').on(t.ownerId),
]);

export const reportResourceAcls = pgTable('report_resource_acls', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  subjectType: reportAclSubjectTypeEnum('subject_type').notNull(),
  subjectId: integer('subject_id').notNull(),
  role: reportAclRoleEnum('role').notNull(),
  inheritFromFolder: boolean('inherit_from_folder').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  grantedBy: integer('granted_by').references(() => users.id, { onDelete: 'set null' }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_resource_acls_tenant_subject_uq')
    .on(t.tenantId, t.resourceType, t.resourceId, t.subjectType, t.subjectId, t.inheritFromFolder)
    .where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_resource_acls_global_subject_uq')
    .on(t.resourceType, t.resourceId, t.subjectType, t.subjectId, t.inheritFromFolder)
    .where(sql`${t.tenantId} is null`),
  index('report_resource_acls_resource_idx').on(t.tenantId, t.resourceType, t.resourceId),
  index('report_resource_acls_subject_idx').on(t.tenantId, t.subjectType, t.subjectId),
  index('report_resource_acls_expires_idx').on(t.expiresAt),
]);

export const reportPublishApprovals = pgTable('report_publish_approvals', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  action: varchar('action', { length: 16 }).$type<'publish' | 'promote' | 'deprecate'>().notNull(),
  requestedRevision: integer('requested_revision').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  status: reportApprovalStatusEnum('status').notNull().default('pending'),
  requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNote: varchar('decision_note', { length: 1000 }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_publish_approvals_resource_idx').on(t.tenantId, t.resourceType, t.resourceId),
  index('report_publish_approvals_status_time_idx').on(t.tenantId, t.status, t.requestedAt),
  index('report_publish_approvals_requester_idx').on(t.requestedBy),
]);

export const reportResourceTransfers = pgTable('report_resource_transfers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  fromOwnerId: integer('from_owner_id').references(() => users.id, { onDelete: 'set null' }),
  toOwnerId: integer('to_owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: reportTransferStatusEnum('status').notNull().default('pending'),
  reason: varchar('reason', { length: 500 }),
  requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNote: varchar('decision_note', { length: 500 }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_resource_transfers_resource_idx').on(t.tenantId, t.resourceType, t.resourceId),
  index('report_resource_transfers_owner_status_idx').on(t.toOwnerId, t.status, t.createdAt),
]);

export const reportEnvironments = pgTable('report_environments', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  kind: reportEnvironmentKindEnum('kind').notNull(),
  description: varchar('description', { length: 500 }),
  baseUrl: varchar('base_url', { length: 1024 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  isDefault: boolean('is_default').notNull().default(false),
  status: statusEnum('status').notNull().default('enabled'),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_environments_tenant_code_uq').on(t.tenantId, t.code).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_environments_global_code_uq').on(t.code).where(sql`${t.tenantId} is null`),
  uniqueIndex('report_environments_tenant_default_uq').on(t.tenantId).where(sql`${t.tenantId} is not null and ${t.isDefault} = true`),
  uniqueIndex('report_environments_global_default_uq').on(t.isDefault).where(sql`${t.tenantId} is null and ${t.isDefault} = true`),
  index('report_environments_tenant_kind_status_idx').on(t.tenantId, t.kind, t.status),
]);

export const reportEnvironmentPromotions = pgTable('report_environment_promotions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  sourceEnvironmentId: integer('source_environment_id').notNull().references(() => reportEnvironments.id, { onDelete: 'restrict' }),
  targetEnvironmentId: integer('target_environment_id').notNull().references(() => reportEnvironments.id, { onDelete: 'restrict' }),
  sourceRevision: integer('source_revision').notNull(),
  sourceSnapshot: jsonb('source_snapshot').$type<Record<string, unknown>>().notNull(),
  targetSnapshot: jsonb('target_snapshot').$type<Record<string, unknown> | null>(),
  rollbackSnapshot: jsonb('rollback_snapshot').$type<Record<string, unknown> | null>(),
  status: reportPromotionStatusEnum('status').notNull().default('pending'),
  requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  deployedBy: integer('deployed_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: varchar('error_message', { length: 1000 }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_environment_promotions_resource_idx').on(t.tenantId, t.resourceType, t.resourceId, t.createdAt),
  index('report_environment_promotions_target_status_idx').on(t.targetEnvironmentId, t.status, t.createdAt),
]);

export const reportDqRules = pgTable('report_dq_rules', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  type: reportDqRuleTypeEnum('type').notNull(),
  field: varchar('field', { length: 128 }),
  severity: reportDqSeverityEnum('severity').notNull().default('medium'),
  config: jsonb('config').$type<ReportDqRuleConfig>().notNull().default(sql`'{}'::jsonb`),
  cron: varchar('cron', { length: 64 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Shanghai'),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastStatus: reportDqRunStatusEnum('last_status'),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_dq_rules_tenant_dataset_name_uq').on(t.tenantId, t.datasetId, t.name).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_dq_rules_global_dataset_name_uq').on(t.datasetId, t.name).where(sql`${t.tenantId} is null`),
  index('report_dq_rules_dataset_enabled_idx').on(t.datasetId, t.enabled),
  index('report_dq_rules_schedule_idx').on(t.enabled, t.cron),
]);

export const reportDqRuns = pgTable('report_dq_runs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  ruleId: integer('rule_id').notNull().references(() => reportDqRules.id, { onDelete: 'cascade' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  status: reportDqRunStatusEnum('status').notNull().default('pending'),
  triggerType: varchar('trigger_type', { length: 32 }).$type<'manual' | 'scheduled' | 'dataset_refresh'>().notNull(),
  checkedRows: bigint('checked_rows', { mode: 'number' }).notNull().default(0),
  failedRows: bigint('failed_rows', { mode: 'number' }).notNull().default(0),
  passRate: doublePrecision('pass_rate'),
  sampleRows: jsonb('sample_rows').$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
  sampleRowCount: integer('sample_row_count').notNull().default(0),
  sampleBytes: bigint('sample_bytes', { mode: 'number' }).notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  errorMessage: varchar('error_message', { length: 1000 }),
  schemaSignature: varchar('schema_signature', { length: 128 }),
  requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_dq_runs_rule_time_idx').on(t.ruleId, t.createdAt),
  index('report_dq_runs_dataset_status_time_idx').on(t.datasetId, t.status, t.createdAt),
  index('report_dq_runs_tenant_time_idx').on(t.tenantId, t.createdAt),
]);

export const reportDqScores = pgTable('report_dq_scores', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  score: doublePrecision('score').notNull(),
  passedRules: integer('passed_rules').notNull().default(0),
  failedRules: integer('failed_rules').notNull().default(0),
  totalRules: integer('total_rules').notNull().default(0),
  dimensions: jsonb('dimensions').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('report_dq_scores_dataset_time_idx').on(t.datasetId, t.measuredAt),
  index('report_dq_scores_tenant_time_idx').on(t.tenantId, t.measuredAt),
]);

export const reportDqAnomalies = pgTable('report_dq_anomalies', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  ruleId: integer('rule_id').references(() => reportDqRules.id, { onDelete: 'set null' }),
  runId: integer('run_id').references(() => reportDqRuns.id, { onDelete: 'set null' }),
  severity: reportDqSeverityEnum('severity').notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  detail: text('detail'),
  sample: jsonb('sample').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  sampleRowCount: integer('sample_row_count').notNull().default(0),
  sampleBytes: bigint('sample_bytes', { mode: 'number' }).notNull().default(0),
  status: reportDqAnomalyStatusEnum('status').notNull().default('open'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: integer('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
  acknowledgementNote: varchar('acknowledgement_note', { length: 1000 }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_dq_anomalies_dataset_status_idx').on(t.datasetId, t.status, t.createdAt),
  index('report_dq_anomalies_tenant_severity_status_idx').on(t.tenantId, t.severity, t.status),
  index('report_dq_anomalies_run_idx').on(t.runId),
]);

export const reportMaterializationSnapshots = pgTable('report_materialization_snapshots', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  strategy: reportMaterializationStrategyEnum('strategy').notNull().default('full'),
  status: reportSnapshotStatusEnum('status').notNull().default('pending'),
  revision: integer('revision').notNull(),
  keyField: varchar('key_field', { length: 128 }),
  watermark: varchar('watermark', { length: 256 }),
  deltaWindowMinutes: integer('delta_window_minutes'),
  fileId: pgUuid('file_id').references(() => managedFiles.id, { onDelete: 'set null' }),
  inlineData: jsonb('inline_data').$type<ReportDataResult | null>(),
  rowCount: bigint('row_count', { mode: 'number' }).notNull().default(0),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
  checksum: varchar('checksum', { length: 128 }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  errorMessage: varchar('error_message', { length: 1000 }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_materialization_snapshots_dataset_revision_uq').on(t.datasetId, t.revision),
  index('report_materialization_snapshots_dataset_status_idx').on(t.datasetId, t.status, t.createdAt),
  index('report_materialization_snapshots_tenant_expiry_idx').on(t.tenantId, t.expiresAt),
]);

export const reportQueryQuotas = pgTable('report_query_quotas', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  scope: reportQuotaScopeEnum('scope').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  maxConcurrent: integer('max_concurrent').notNull(),
  dailyQueryLimit: bigint('daily_query_limit', { mode: 'number' }).notNull().default(0),
  dailyRowLimit: bigint('daily_row_limit', { mode: 'number' }).notNull().default(0),
  dailyByteLimit: bigint('daily_byte_limit', { mode: 'number' }).notNull().default(0),
  dailyCostLimit: doublePrecision('daily_cost_limit').notNull().default(0),
  resetTimezone: varchar('reset_timezone', { length: 64 }).notNull().default('Asia/Shanghai'),
  enabled: boolean('enabled').notNull().default(true),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_query_quotas_tenant_scope_uq').on(t.tenantId, t.scope)
    .where(sql`${t.tenantId} is not null and ${t.scope} = 'tenant' and ${t.userId} is null`),
  uniqueIndex('report_query_quotas_global_scope_uq').on(t.scope)
    .where(sql`${t.tenantId} is null and ${t.scope} = 'tenant' and ${t.userId} is null`),
  uniqueIndex('report_query_quotas_tenant_user_uq').on(t.tenantId, t.userId)
    .where(sql`${t.tenantId} is not null and ${t.scope} = 'user' and ${t.userId} is not null`),
  uniqueIndex('report_query_quotas_global_user_uq').on(t.userId)
    .where(sql`${t.tenantId} is null and ${t.scope} = 'user' and ${t.userId} is not null`),
  index('report_query_quotas_enabled_idx').on(t.tenantId, t.enabled),
]);

export const reportQueryCostLogs = pgTable('report_query_cost_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').references(() => reportDatasets.id, { onDelete: 'set null' }),
  datasourceId: integer('datasource_id').references(() => reportDatasources.id, { onDelete: 'set null' }),
  scene: varchar('scene', { length: 64 }).notNull(),
  requestId: varchar('request_id', { length: 128 }).notNull(),
  queuedMs: integer('queued_ms').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  rowCount: bigint('row_count', { mode: 'number' }).notNull().default(0),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
  costUnits: doublePrecision('cost_units').notNull().default(0),
  cacheHit: boolean('cache_hit').notNull().default(false),
  success: boolean('success').notNull().default(true),
  errorCode: varchar('error_code', { length: 64 }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('report_query_cost_logs_request_uq').on(t.requestId),
  index('report_query_cost_logs_tenant_time_idx').on(t.tenantId, t.occurredAt),
  index('report_query_cost_logs_user_time_idx').on(t.userId, t.occurredAt),
  index('report_query_cost_logs_dataset_time_idx').on(t.datasetId, t.occurredAt),
]);

export const reportSlaRules = pgTable('report_sla_rules', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  type: reportSlaTypeEnum('type').notNull(),
  targetValue: doublePrecision('target_value').notNull(),
  warningValue: doublePrecision('warning_value'),
  windowMinutes: integer('window_minutes').notNull(),
  cron: varchar('cron', { length: 64 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Shanghai'),
  severity: reportDqSeverityEnum('severity').notNull().default('high'),
  channels: jsonb('channels').$type<ReportNotifyChannel[]>().notNull().default(sql`'[]'::jsonb`),
  recipients: varchar('recipients', { length: 512 }),
  webhookUrl: varchar('webhook_url', { length: 512 }),
  silenceMins: integer('silence_mins').notNull().default(60),
  enabled: boolean('enabled').notNull().default(true),
  lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_sla_rules_tenant_dataset_name_uq').on(t.tenantId, t.datasetId, t.name).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_sla_rules_global_dataset_name_uq').on(t.datasetId, t.name).where(sql`${t.tenantId} is null`),
  index('report_sla_rules_dataset_enabled_idx').on(t.datasetId, t.enabled),
]);

export const reportSlaViolations = pgTable('report_sla_violations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  ruleId: integer('rule_id').notNull().references(() => reportSlaRules.id, { onDelete: 'cascade' }),
  datasetId: integer('dataset_id').notNull().references(() => reportDatasets.id, { onDelete: 'cascade' }),
  status: reportSlaViolationStatusEnum('status').notNull().default('open'),
  observedValue: doublePrecision('observed_value').notNull(),
  targetValue: doublePrecision('target_value').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  windowEndedAt: timestamp('window_ended_at', { withTimezone: true }).notNull(),
  detail: text('detail'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: integer('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolutionNote: varchar('resolution_note', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_sla_violations_rule_time_idx').on(t.ruleId, t.createdAt),
  index('report_sla_violations_tenant_status_idx').on(t.tenantId, t.status, t.createdAt),
]);

export const reportAssetUsageLogs = pgTable('report_asset_usage_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 16 }).$type<'view' | 'query' | 'export' | 'embed' | 'share'>().notNull(),
  scene: varchar('scene', { length: 64 }),
  durationMs: integer('duration_ms'),
  rowCount: bigint('row_count', { mode: 'number' }).notNull().default(0),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
  success: boolean('success').notNull().default(true),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('report_asset_usage_logs_resource_time_idx').on(t.tenantId, t.resourceType, t.resourceId, t.occurredAt),
  index('report_asset_usage_logs_user_time_idx').on(t.userId, t.occurredAt),
]);

export const reportDeprecationNotices = pgTable('report_deprecation_notices', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: reportResourceTypeEnum('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  title: varchar('title', { length: 128 }).notNull(),
  message: text('message').notNull(),
  replacementResourceType: reportResourceTypeEnum('replacement_resource_type'),
  replacementResourceId: integer('replacement_resource_id'),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: integer('published_by').references(() => users.id, { onDelete: 'set null' }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_deprecation_notices_resource_idx').on(t.tenantId, t.resourceType, t.resourceId),
  index('report_deprecation_notices_effective_idx').on(t.tenantId, t.effectiveAt, t.expiresAt),
]);

export const reportAssetTemplates = pgTable('report_asset_templates', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  folderId: integer('folder_id').references(() => reportFolders.id, { onDelete: 'set null' }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  type: reportAssetTemplateTypeEnum('type').notNull(),
  description: text('description'),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  previewFileId: pgUuid('preview_file_id').references(() => managedFiles.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  usageCount: integer('usage_count').notNull().default(0),
  status: statusEnum('status').notNull().default('enabled'),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_asset_templates_tenant_code_uq').on(t.tenantId, t.code).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_asset_templates_global_code_uq').on(t.code).where(sql`${t.tenantId} is null`),
  index('report_asset_templates_tenant_type_status_idx').on(t.tenantId, t.type, t.status),
  index('report_asset_templates_folder_idx').on(t.folderId),
  index('report_asset_templates_owner_idx').on(t.ownerId),
]);

export const reportChatbiSessions = pgTable('report_chatbi_sessions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 128 }).notNull(),
  datasourceId: integer('datasource_id').references(() => reportDatasources.id, { onDelete: 'set null' }),
  datasetId: integer('dataset_id').references(() => reportDatasets.id, { onDelete: 'set null' }),
  allowedTables: jsonb('allowed_tables').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  contextSnapshot: jsonb('context_snapshot').$type<ReportChatbiContextSnapshot>().notNull(),
  status: reportChatbiSessionStatusEnum('status').notNull().default('active'),
  totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
  totalCostUnits: doublePrecision('total_cost_units').notNull().default(0),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_chatbi_sessions_user_status_time_idx').on(t.tenantId, t.userId, t.status, t.updatedAt),
  index('report_chatbi_sessions_dataset_idx').on(t.datasetId),
  index('report_chatbi_sessions_datasource_idx').on(t.datasourceId),
]);

export const reportChatbiMessages = pgTable('report_chatbi_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  sessionId: integer('session_id').notNull().references(() => reportChatbiSessions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  role: reportChatbiMessageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  generatedSql: text('generated_sql'),
  chartSuggestion: jsonb('chart_suggestion').$type<ReportChatbiChartSuggestion | null>(),
  resultSample: jsonb('result_sample').$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
  resultRowCount: bigint('result_row_count', { mode: 'number' }).notNull().default(0),
  resultByteSize: bigint('result_byte_size', { mode: 'number' }).notNull().default(0),
  savedResourceType: reportResourceTypeEnum('saved_resource_type'),
  savedResourceId: integer('saved_resource_id'),
  savedDatasetId: integer('saved_dataset_id').references(() => reportDatasets.id, { onDelete: 'set null' }),
  savedDashboardId: integer('saved_dashboard_id').references(() => reportDashboards.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  costUnits: doublePrecision('cost_units').notNull().default(0),
  latencyMs: integer('latency_ms'),
  modelId: varchar('model_id', { length: 128 }),
  errorMessage: varchar('error_message', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('report_chatbi_messages_session_time_idx').on(t.sessionId, t.createdAt),
  index('report_chatbi_messages_tenant_user_time_idx').on(t.tenantId, t.userId, t.createdAt),
]);

export const reportFillTemplates = pgTable('report_fill_templates', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  folderId: integer('folder_id').references(() => reportFolders.id, { onDelete: 'set null' }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  formSchema: jsonb('form_schema').$type<WorkflowFormSchema>().notNull(),
  publishedSchema: jsonb('published_schema').$type<WorkflowFormSchema>(),
  publishedRevision: integer('published_revision'),
  workflowDefinitionId: integer('workflow_definition_id').references(() => workflowDefinitions.id, { onDelete: 'set null' }),
  needReview: boolean('need_review').notNull().default(false),
  generatedDatasetId: integer('generated_dataset_id').references(() => reportDatasets.id, { onDelete: 'set null' }),
  status: reportFillTemplateStatusEnum('status').notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: integer('published_by').references(() => users.id, { onDelete: 'set null' }),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  uniqueIndex('report_fill_templates_tenant_code_uq').on(t.tenantId, t.code).where(sql`${t.tenantId} is not null`),
  uniqueIndex('report_fill_templates_global_code_uq').on(t.code).where(sql`${t.tenantId} is null`),
  index('report_fill_templates_tenant_status_idx').on(t.tenantId, t.status),
  index('report_fill_templates_folder_idx').on(t.folderId),
  index('report_fill_templates_owner_idx').on(t.ownerId),
  index('report_fill_templates_dataset_idx').on(t.generatedDatasetId),
]);

export const reportFillRecords = pgTable('report_fill_records', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').notNull().references(() => reportFillTemplates.id, { onDelete: 'restrict' }),
  submitterId: integer('submitter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: reportFillRecordStatusEnum('status').notNull().default('draft'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  templateRevision: integer('template_revision').notNull(),
  templateSchemaSnapshot: jsonb('template_schema_snapshot').$type<WorkflowFormSchema>().notNull(),
  templateNeedReview: boolean('template_need_review').notNull(),
  workflowDefinitionIdSnapshot: integer('workflow_definition_id_snapshot'),
  submitComment: varchar('submit_comment', { length: 1000 }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewComment: varchar('review_comment', { length: 1000 }),
  workflowInstanceId: integer('workflow_instance_id').references(() => workflowInstances.id, { onDelete: 'set null' }),
  generatedDatasetId: integer('generated_dataset_id').references(() => reportDatasets.id, { onDelete: 'set null' }),
  syncStatus: reportFillSyncStatusEnum('sync_status').notNull().default('pending'),
  syncTaskId: integer('sync_task_id'),
  syncError: varchar('sync_error', { length: 1000 }),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  revision: integer('revision').notNull().default(1),
  ...auditColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index('report_fill_records_template_status_time_idx').on(t.templateId, t.status, t.createdAt),
  index('report_fill_records_submitter_status_time_idx').on(t.tenantId, t.submitterId, t.status, t.createdAt),
  index('report_fill_records_workflow_idx').on(t.workflowInstanceId),
  index('report_fill_records_dataset_idx').on(t.generatedDatasetId),
  index('report_fill_records_sync_idx').on(t.tenantId, t.syncStatus, t.updatedAt),
]);

export type ReportMetricRow = typeof reportMetrics.$inferSelect;
export type NewReportMetric = typeof reportMetrics.$inferInsert;
export type ReportResourceAclRow = typeof reportResourceAcls.$inferSelect;
export type NewReportResourceAcl = typeof reportResourceAcls.$inferInsert;
export type ReportPublishApprovalRow = typeof reportPublishApprovals.$inferSelect;
export type NewReportPublishApproval = typeof reportPublishApprovals.$inferInsert;
export type ReportResourceTransferRow = typeof reportResourceTransfers.$inferSelect;
export type NewReportResourceTransfer = typeof reportResourceTransfers.$inferInsert;
export type ReportEnvironmentRow = typeof reportEnvironments.$inferSelect;
export type NewReportEnvironment = typeof reportEnvironments.$inferInsert;
export type ReportEnvironmentPromotionRow = typeof reportEnvironmentPromotions.$inferSelect;
export type NewReportEnvironmentPromotion = typeof reportEnvironmentPromotions.$inferInsert;
export type ReportDqRuleRow = typeof reportDqRules.$inferSelect;
export type NewReportDqRule = typeof reportDqRules.$inferInsert;
export type ReportDqRunRow = typeof reportDqRuns.$inferSelect;
export type ReportDqScoreRow = typeof reportDqScores.$inferSelect;
export type ReportDqAnomalyRow = typeof reportDqAnomalies.$inferSelect;
export type ReportMaterializationSnapshotRow = typeof reportMaterializationSnapshots.$inferSelect;
export type ReportQueryQuotaRow = typeof reportQueryQuotas.$inferSelect;
export type NewReportQueryQuota = typeof reportQueryQuotas.$inferInsert;
export type ReportQueryCostLogRow = typeof reportQueryCostLogs.$inferSelect;
export type ReportSlaRuleRow = typeof reportSlaRules.$inferSelect;
export type NewReportSlaRule = typeof reportSlaRules.$inferInsert;
export type ReportSlaViolationRow = typeof reportSlaViolations.$inferSelect;
export type ReportAssetUsageLogRow = typeof reportAssetUsageLogs.$inferSelect;
export type ReportDeprecationNoticeRow = typeof reportDeprecationNotices.$inferSelect;
export type NewReportDeprecationNotice = typeof reportDeprecationNotices.$inferInsert;
export type ReportAssetTemplateRow = typeof reportAssetTemplates.$inferSelect;
export type NewReportAssetTemplate = typeof reportAssetTemplates.$inferInsert;
export type ReportChatbiSessionRow = typeof reportChatbiSessions.$inferSelect;
export type NewReportChatbiSession = typeof reportChatbiSessions.$inferInsert;
export type ReportChatbiMessageRow = typeof reportChatbiMessages.$inferSelect;
export type ReportFillTemplateRow = typeof reportFillTemplates.$inferSelect;
export type NewReportFillTemplate = typeof reportFillTemplates.$inferInsert;
export type ReportFillRecordRow = typeof reportFillRecords.$inferSelect;
export type NewReportFillRecord = typeof reportFillRecords.$inferInsert;
