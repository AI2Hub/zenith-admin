import { z } from '@hono/zod-openapi';
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
  REPORT_RESOURCE_TYPES,
  REPORT_SLA_TYPES,
  REPORT_SLA_VIOLATION_STATUSES,
  REPORT_SNAPSHOT_STATUSES,
  REPORT_TRANSFER_STATUSES,
  REPORT_WIDGET_TYPES,
} from '@zenith/shared';
import { auditFields } from './_audit';
import { ReportDatasetDTO } from './report';

const nullableId = z.number().int().nullable();
const status = z.enum(['enabled', 'disabled']);
const resourceType = z.enum(REPORT_RESOURCE_TYPES);
const tenantFields = { tenantId: nullableId };
const timestamps = { createdAt: z.string(), updatedAt: z.string() };

export const ReportFolderDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  parentId: nullableId,
  name: z.string(),
  resourceType,
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  sort: z.number().int(),
  status,
  ...auditFields,
  ...timestamps,
}).openapi('ReportFolder');

export const ReportFolderTreeNodeDTO: z.ZodTypeAny = ReportFolderDTO.extend({
  children: z.lazy((): z.ZodArray<typeof ReportFolderTreeNodeDTO> => z.array(ReportFolderTreeNodeDTO)).optional(),
  resourceCount: z.number().int().optional(),
}).openapi('ReportFolderTreeNode');

export const ReportResourceSummaryDTO = z.object({
  resourceType,
  resourceId: z.number().int(),
  name: z.string(),
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  folderId: nullableId,
  folderName: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  updatedAt: z.string(),
}).openapi('ReportResourceSummary');

export const ReportMetricDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  folderId: nullableId,
  folderName: z.string().nullable().optional(),
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.enum(REPORT_METRIC_TYPES),
  datasetId: z.number().int(),
  datasetName: z.string().nullable().optional(),
  sourceField: z.string().nullable().optional(),
  formula: z.string().nullable().optional(),
  aggregate: z.enum(['sum', 'avg', 'max', 'min', 'count', 'distinct_count']).nullable().optional(),
  dimensions: z.array(z.string()),
  timeField: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  caliber: z.string().nullable().optional(),
  lifecycleStatus: z.enum(REPORT_METRIC_LIFECYCLE_STATUSES),
  revision: z.number().int(),
  publishedSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  publishedBy: nullableId.optional(),
  deprecatedAt: z.string().nullable().optional(),
  deprecatedBy: nullableId.optional(),
  deprecationReason: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportMetric');

export const ReportMetricEvaluationDTO = z.object({
  metricId: z.number().int(),
  code: z.string(),
  value: z.number(),
  formattedValue: z.string(),
  unit: z.string().nullable().optional(),
  durationMs: z.number().int(),
  cacheHit: z.boolean(),
}).openapi('ReportMetricEvaluation');

export const ReportMetricLookupDTO = z.object({
  id: z.number().int(),
  name: z.string(),
  code: z.string(),
  status: z.enum(REPORT_METRIC_LIFECYCLE_STATUSES),
  datasetId: z.number().int(),
  type: z.literal('metric'),
}).openapi('ReportMetricLookup');

export const ReportMetricRefsDTO = z.object({
  dashboards: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    widgets: z.array(z.string()),
  })),
  alerts: z.array(z.object({ id: z.number().int(), name: z.string() })),
  metrics: z.array(z.object({ id: z.number().int(), code: z.string(), name: z.string() })),
}).openapi('ReportMetricRefs');

export const ReportResourceAclDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  subjectType: z.enum(REPORT_ACL_SUBJECT_TYPES),
  subjectId: z.number().int(),
  role: z.enum(REPORT_ACL_ROLES),
  inheritFromFolder: z.boolean(),
  expiresAt: z.string().nullable().optional(),
  grantedBy: nullableId,
  grantedByName: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportResourceAcl');

export const ReportPublishApprovalDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  resourceName: z.string().nullable().optional(),
  action: z.enum(['publish', 'promote', 'deprecate']),
  requestedRevision: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  status: z.enum(REPORT_APPROVAL_STATUSES),
  requestedBy: nullableId,
  requestedByName: z.string().nullable().optional(),
  requestedAt: z.string(),
  decidedBy: nullableId.optional(),
  decidedByName: z.string().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  decisionNote: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportPublishApproval');

export const ReportResourceTransferDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  resourceName: z.string().nullable().optional(),
  fromOwnerId: nullableId,
  fromOwnerName: z.string().nullable().optional(),
  toOwnerId: z.number().int(),
  toOwnerName: z.string().nullable().optional(),
  status: z.enum(REPORT_TRANSFER_STATUSES),
  reason: z.string().nullable().optional(),
  requestedBy: nullableId,
  decidedBy: nullableId.optional(),
  decidedAt: z.string().nullable().optional(),
  decisionNote: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportResourceTransfer');

export const ReportEnvironmentDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  code: z.string(),
  name: z.string(),
  kind: z.enum(REPORT_ENVIRONMENT_KINDS),
  description: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  status,
  ...auditFields,
  ...timestamps,
}).openapi('ReportEnvironment');

export const ReportEnvironmentPromotionDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  resourceName: z.string().nullable().optional(),
  sourceEnvironmentId: z.number().int(),
  sourceEnvironmentName: z.string().nullable().optional(),
  targetEnvironmentId: z.number().int(),
  targetEnvironmentName: z.string().nullable().optional(),
  sourceRevision: z.number().int(),
  sourceSnapshot: z.record(z.string(), z.unknown()),
  targetSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  rollbackSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(REPORT_PROMOTION_STATUSES),
  requestedBy: nullableId,
  approvedBy: nullableId.optional(),
  deployedBy: nullableId.optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  schemaSignature: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportEnvironmentPromotion');

const ReportDqRuleConfigDTO = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  pattern: z.string().nullable().optional(),
  maxAgeMinutes: z.number().int().nullable().optional(),
  minRows: z.number().int().nullable().optional(),
  maxRows: z.number().int().nullable().optional(),
  sql: z.string().nullable().optional(),
});

export const ReportDqRuleDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  datasetId: z.number().int(),
  datasetName: z.string().nullable().optional(),
  name: z.string(),
  type: z.enum(REPORT_DQ_RULE_TYPES),
  field: z.string().nullable().optional(),
  severity: z.enum(REPORT_DQ_SEVERITIES),
  config: ReportDqRuleConfigDTO,
  cron: z.string().nullable().optional(),
  timezone: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable().optional(),
  lastStatus: z.enum(REPORT_DQ_RUN_STATUSES).nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportDqRule');

export const ReportDqRunDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  ruleId: z.number().int(),
  datasetId: z.number().int(),
  status: z.enum(REPORT_DQ_RUN_STATUSES),
  triggerType: z.enum(['manual', 'scheduled', 'dataset_refresh']),
  checkedRows: z.number().int(),
  failedRows: z.number().int(),
  passRate: z.number().nullable().optional(),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
  sampleRowCount: z.number().int(),
  sampleBytes: z.number().int(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  requestedBy: nullableId.optional(),
  ...timestamps,
}).openapi('ReportDqRun');

export const ReportDqScoreDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  datasetId: z.number().int(),
  score: z.number(),
  passedRules: z.number().int(),
  failedRules: z.number().int(),
  totalRules: z.number().int(),
  dimensions: z.record(z.string(), z.number()),
  measuredAt: z.string(),
  createdAt: z.string(),
}).openapi('ReportDqScore');

export const ReportDqAnomalyDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  datasetId: z.number().int(),
  ruleId: nullableId.optional(),
  runId: nullableId.optional(),
  severity: z.enum(REPORT_DQ_SEVERITIES),
  title: z.string(),
  detail: z.string().nullable().optional(),
  sample: z.record(z.string(), z.unknown()),
  sampleRowCount: z.number().int().optional(),
  sampleBytes: z.number().int().optional(),
  status: z.enum(REPORT_DQ_ANOMALY_STATUSES),
  acknowledgedAt: z.string().nullable().optional(),
  acknowledgedBy: nullableId.optional(),
  acknowledgementNote: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolvedBy: nullableId.optional(),
  ...timestamps,
}).openapi('ReportDqAnomaly');

export const ReportMaterializationSnapshotDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  datasetId: z.number().int(),
  strategy: z.enum(REPORT_MATERIALIZATION_STRATEGIES),
  status: z.enum(REPORT_SNAPSHOT_STATUSES),
  revision: z.number().int(),
  keyField: z.string().nullable().optional(),
  watermark: z.string().nullable().optional(),
  deltaWindowMinutes: z.number().int().nullable().optional(),
  fileId: z.string().uuid().nullable().optional(),
  rowCount: z.number().int(),
  byteSize: z.number().int(),
  checksum: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportMaterializationSnapshot');

export const ReportQueryQuotaDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  scope: z.enum(REPORT_QUOTA_SCOPES),
  userId: nullableId.optional(),
  maxConcurrent: z.number().int(),
  dailyQueryLimit: z.number().int(),
  dailyRowLimit: z.number().int(),
  dailyByteLimit: z.number().int(),
  dailyCostLimit: z.number(),
  resetTimezone: z.string(),
  enabled: z.boolean(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportQueryQuota');

export const ReportQueryCostLogDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  userId: nullableId.optional(),
  datasetId: nullableId.optional(),
  datasourceId: nullableId.optional(),
  scene: z.string(),
  requestId: z.string(),
  queuedMs: z.number().int(),
  durationMs: z.number().int(),
  rowCount: z.number().int(),
  byteSize: z.number().int(),
  costUnits: z.number(),
  cacheHit: z.boolean(),
  success: z.boolean(),
  errorCode: z.string().nullable().optional(),
  occurredAt: z.string(),
}).openapi('ReportQueryCostLog');

export const ReportSlaRuleDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  datasetId: z.number().int(),
  name: z.string(),
  type: z.enum(REPORT_SLA_TYPES),
  targetValue: z.number(),
  warningValue: z.number().nullable().optional(),
  windowMinutes: z.number().int(),
  cron: z.string().nullable().optional(),
  timezone: z.string(),
  severity: z.enum(REPORT_DQ_SEVERITIES),
  channels: z.array(z.enum(['email', 'inApp', 'webhook'])),
  recipients: z.string().nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  silenceMins: z.number().int(),
  enabled: z.boolean(),
  lastEvaluatedAt: z.string().nullable().optional(),
  lastNotifiedAt: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportSlaRule');

export const ReportSlaViolationDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  ruleId: z.number().int(),
  datasetId: z.number().int(),
  status: z.enum(REPORT_SLA_VIOLATION_STATUSES),
  observedValue: z.number(),
  targetValue: z.number(),
  windowStartedAt: z.string(),
  windowEndedAt: z.string(),
  detail: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  acknowledgedBy: nullableId.optional(),
  resolvedAt: z.string().nullable().optional(),
  resolvedBy: nullableId.optional(),
  resolutionNote: z.string().nullable().optional(),
  ...timestamps,
}).openapi('ReportSlaViolation');

export const ReportAssetUsageLogDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  userId: nullableId.optional(),
  action: z.enum(['view', 'query', 'export', 'embed', 'share']),
  scene: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  rowCount: z.number().int(),
  byteSize: z.number().int(),
  success: z.boolean(),
  occurredAt: z.string(),
}).openapi('ReportAssetUsageLog');

export const ReportDeprecationNoticeDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  resourceType,
  resourceId: z.number().int(),
  title: z.string(),
  message: z.string(),
  replacementResourceType: resourceType.nullable().optional(),
  replacementResourceId: nullableId.optional(),
  effectiveAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  publishedBy: nullableId.optional(),
  processedAt: z.string().nullable().optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportDeprecationNotice');

export const ReportAssetTemplateDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  folderId: nullableId,
  folderName: z.string().nullable().optional(),
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  code: z.string(),
  name: z.string(),
  type: z.enum(REPORT_ASSET_TEMPLATE_TYPES),
  description: z.string().nullable().optional(),
  content: z.record(z.string(), z.unknown()),
  previewFileId: z.string().uuid().nullable().optional(),
  version: z.number().int(),
  usageCount: z.number().int(),
  status,
  ...auditFields,
  ...timestamps,
}).openapi('ReportAssetTemplate');

export const ReportChatbiChartSuggestionDTO = z.object({
  type: z.enum(REPORT_WIDGET_TYPES),
  title: z.string(),
  categoryField: z.string().optional(),
  valueFields: z.array(z.string()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).openapi('ReportChatbiChartSuggestion');

export const ReportChatbiSessionDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  userId: z.number().int(),
  title: z.string(),
  datasourceId: nullableId.optional(),
  datasetId: nullableId.optional(),
  allowedTables: z.array(z.string()),
  contextSnapshot: z.object({
    datasourceId: z.number().int(),
    datasourceName: z.string(),
    datasourceType: z.string(),
    datasetId: nullableId.optional(),
    tables: z.array(z.object({
      name: z.string(),
      columns: z.array(z.object({ name: z.string(), type: z.string() })),
    })),
    frozenAt: z.string(),
  }),
  status: z.enum(REPORT_CHATBI_SESSION_STATUSES),
  totalTokens: z.number().int(),
  totalCostUnits: z.number(),
  lastMessageAt: z.string().nullable().optional(),
  ...timestamps,
}).openapi('ReportChatbiSession');

export const ReportChatbiMessageDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  sessionId: z.number().int(),
  userId: nullableId.optional(),
  role: z.enum(REPORT_CHATBI_MESSAGE_ROLES),
  content: z.string(),
  generatedSql: z.string().nullable().optional(),
  chartSuggestion: ReportChatbiChartSuggestionDTO.nullable().optional(),
  resultSample: z.array(z.record(z.string(), z.unknown())),
  resultRowCount: z.number().int(),
  resultByteSize: z.number().int(),
  savedResourceType: resourceType.nullable().optional(),
  savedResourceId: nullableId.optional(),
  savedDatasetId: nullableId.optional(),
  savedDashboardId: nullableId.optional(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  costUnits: z.number(),
  latencyMs: z.number().int().nullable().optional(),
  modelId: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
}).openapi('ReportChatbiMessage');

export const ReportChatbiSessionDetailDTO = z.object({
  session: ReportChatbiSessionDTO,
  messages: z.array(ReportChatbiMessageDTO),
}).openapi('ReportChatbiSessionDetail');

export const ReportChatbiQuotaDTO = z.object({
  aiPromptTokensToday: z.number().int(),
  aiCompletionTokensToday: z.number().int(),
  aiRequestsToday: z.number().int(),
  queryCountToday: z.number().int(),
  queryRowsToday: z.number().int(),
  queryBytesToday: z.number().int(),
  queryCostUnitsToday: z.number(),
}).openapi('ReportChatbiQuota');

export const ReportChatbiSavedResourceDTO = z.object({
  resourceType: z.enum(['dataset', 'dashboard']),
  resourceId: z.number().int(),
  name: z.string(),
  datasetId: z.number().int().nullable().optional(),
}).openapi('ReportChatbiSavedResource');

export const ReportFillTemplateDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  folderId: nullableId,
  folderName: z.string().nullable().optional(),
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  formSchema: z.record(z.string(), z.unknown()),
  publishedSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  publishedRevision: z.number().int().nullable().optional(),
  workflowDefinitionId: nullableId.optional(),
  workflowDefinitionName: z.string().nullable().optional(),
  needReview: z.boolean(),
  generatedDatasetId: nullableId.optional(),
  status: z.enum(REPORT_FILL_TEMPLATE_STATUSES),
  revision: z.number().int(),
  publishedAt: z.string().nullable().optional(),
  publishedBy: nullableId.optional(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportFillTemplate');

export const ReportFillRecordDTO = z.object({
  id: z.number().int(),
  ...tenantFields,
  templateId: z.number().int(),
  templateName: z.string().nullable().optional(),
  submitterId: z.number().int(),
  submitterName: z.string().nullable().optional(),
  status: z.enum(REPORT_FILL_RECORD_STATUSES),
  data: z.record(z.string(), z.unknown()),
  templateRevision: z.number().int(),
  templateSchemaSnapshot: z.record(z.string(), z.unknown()),
  templateNeedReview: z.boolean(),
  workflowDefinitionIdSnapshot: nullableId.optional(),
  submitComment: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: nullableId.optional(),
  reviewComment: z.string().nullable().optional(),
  workflowInstanceId: nullableId.optional(),
  generatedDatasetId: nullableId.optional(),
  syncStatus: z.enum(REPORT_FILL_SYNC_STATUSES),
  syncTaskId: nullableId.optional(),
  syncError: z.string().nullable().optional(),
  syncedAt: z.string().nullable().optional(),
  revision: z.number().int(),
  ...auditFields,
  ...timestamps,
}).openapi('ReportFillRecord');

export const ReportQualitySummaryDTO = z.object({
  datasetId: z.number().int(),
  score: z.number().nullable(),
  totalRules: z.number().int(),
  passedRules: z.number().int(),
  failedRules: z.number().int(),
  openAnomalies: z.number().int(),
  criticalAnomalies: z.number().int(),
  lastMeasuredAt: z.string().nullable().optional(),
}).openapi('ReportQualitySummary');

export const ReportCapacityTrendPointDTO = z.object({
  time: z.string(),
  queries: z.number().int(),
  concurrentPeak: z.number().int(),
  rows: z.number().int(),
  bytes: z.number().int(),
  costUnits: z.number(),
  p95DurationMs: z.number().int(),
}).openapi('ReportCapacityTrendPoint');

export const ReportQueryGovernanceSummaryDTO = z.object({
  concurrentRunning: z.number().int(),
  concurrentLimit: z.number().int(),
  dailyQueries: z.number().int(),
  dailyQueryLimit: z.number().int(),
  dailyRows: z.number().int(),
  dailyRowLimit: z.number().int(),
  dailyBytes: z.number().int(),
  dailyByteLimit: z.number().int(),
  dailyCostUnits: z.number(),
  dailyCostLimit: z.number(),
  trends: z.array(ReportCapacityTrendPointDTO),
}).openapi('ReportQueryGovernanceSummary');

export const ReportAssetUsageSummaryDTO = z.object({
  resourceType,
  resourceId: z.number().int(),
  views: z.number().int(),
  queries: z.number().int(),
  exports: z.number().int(),
  uniqueUsers: z.number().int(),
  lastUsedAt: z.string().nullable().optional(),
  deprecated: z.boolean(),
  deprecationNotice: ReportDeprecationNoticeDTO.nullable().optional(),
}).openapi('ReportAssetUsageSummary');

export const ReportAssetCatalogItemDTO = z.object({
  resourceType,
  resourceId: z.number().int(),
  ...tenantFields,
  name: z.string(),
  ownerId: nullableId,
  ownerName: z.string().nullable().optional(),
  folderId: nullableId,
  folderName: z.string().nullable().optional(),
  lifecycleStatus: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  deprecationEffectiveAt: z.string().nullable().optional(),
  updatedAt: z.string(),
}).openapi('ReportAssetCatalogItem');

export const ReportAssetUsageTrendPointDTO = z.object({
  bucket: z.string(),
  views: z.number().int(),
  queries: z.number().int(),
  exports: z.number().int(),
  embeds: z.number().int(),
  shares: z.number().int(),
  uniqueUsers: z.number().int(),
}).openapi('ReportAssetUsageTrendPoint');

export const ReportAssetTemplateApplyResultDTO = z.object({
  resourceType,
  resourceId: z.number().int(),
  name: z.string(),
}).openapi('ReportAssetTemplateApplyResult');

export const ReportQueryQuotaUsageDTO = z.object({
  ...tenantFields,
  userId: nullableId,
  timezone: z.string(),
  day: z.string(),
  concurrent: z.number().int(),
  queries: z.number().int(),
  rows: z.number().int(),
  bytes: z.number().int(),
  costUnits: z.number(),
  maxConcurrent: z.number().int(),
  dailyQueryLimit: z.number().int(),
  dailyRowLimit: z.number().int(),
  dailyByteLimit: z.number().int(),
  dailyCostLimit: z.number(),
}).openapi('ReportQueryQuotaUsage');

export const ReportQueryCapacityDTO = z.object({
  globalLimit: z.number().int(),
  running: z.number().int(),
  queueDepth: z.number().int(),
  datasourceQueues: z.number().int(),
}).openapi('ReportQueryCapacity');

export const ReportQueryCostStatsDTO = z.object({
  queries: z.number().int(),
  rows: z.number().int(),
  bytes: z.number().int(),
  costUnits: z.number(),
  avgDurationMs: z.number().int(),
  failures: z.number().int(),
  capacity: ReportQueryCapacityDTO,
}).openapi('ReportQueryCostStats');

export const ReportQueryCostTrendPointDTO = z.object({
  bucket: z.string(),
  queries: z.number().int(),
  rows: z.number().int(),
  bytes: z.number().int(),
  costUnits: z.number(),
  avgDurationMs: z.number().int(),
  queueMs: z.number().int(),
}).openapi('ReportQueryCostTrendPoint');

export const ReportMobileDashboardPreferenceDTO = z.object({
  dashboardId: z.number().int(),
  compactMode: z.boolean().optional(),
  hiddenWidgetIds: z.array(z.string()).optional(),
  widgetOrder: z.array(z.string()).optional(),
  defaultFilterValues: z.record(z.string(), z.unknown()).optional(),
  refreshInterval: z.number().int().optional(),
}).openapi('ReportMobileDashboardPreference');

export const ReportResourceDetailDTO = z.object({
  resource: ReportResourceSummaryDTO,
  acls: z.array(ReportResourceAclDTO),
  pendingApprovals: z.array(ReportPublishApprovalDTO),
  usage: ReportAssetUsageSummaryDTO,
  deprecationNotices: z.array(ReportDeprecationNoticeDTO),
}).openapi('ReportResourceDetail');

export const ReportDatasetPlatformDetailDTO = z.object({
  dataset: ReportDatasetDTO,
  metrics: z.array(ReportMetricDTO),
  quality: ReportQualitySummaryDTO,
  materializationSnapshots: z.array(ReportMaterializationSnapshotDTO),
  slaRules: z.array(ReportSlaRuleDTO),
  usage: ReportAssetUsageSummaryDTO,
}).openapi('ReportDatasetPlatformDetail');

export const ReportFillRecordDetailDTO = ReportFillRecordDTO.extend({
  template: ReportFillTemplateDTO,
  workflowStatus: z.string().nullable().optional(),
  generatedDataset: ReportDatasetDTO.nullable().optional(),
}).openapi('ReportFillRecordDetail');

export const ReportPlatformListFacetsDTO = z.object({
  folders: z.array(ReportFolderDTO),
  owners: z.array(z.object({ id: z.number().int(), name: z.string() })),
  statuses: z.array(z.object({ value: z.string(), count: z.number().int() })),
}).openapi('ReportPlatformListFacets');
