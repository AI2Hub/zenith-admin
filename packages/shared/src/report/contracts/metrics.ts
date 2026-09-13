import * as z from 'zod';
import { auditFieldsSchema, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { REPORT_METRIC_LIFECYCLE_STATUSES, REPORT_METRIC_TYPES } from '../types';
import {
  createReportMetricSchema,
  reportMetricEvaluateSchema,
  reportMetricLifecycleActionSchema,
  updateReportMetricSchema,
} from '../validation';
import { reportCodedResourceFields } from './_common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const reportMetricSchema = z.object({
  ...reportCodedResourceFields,
  description: z.string().nullable().optional(),
  type: z.enum(REPORT_METRIC_TYPES),
  datasetId: z.int(),
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
  revision: z.int(),
  publishedSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  publishedBy: z.int().nullable().optional(),
  deprecatedAt: z.string().nullable().optional(),
  deprecatedBy: z.int().nullable().optional(),
  deprecationReason: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ReportMetric' });

export type ReportMetric = z.infer<typeof reportMetricSchema>;

export const reportMetricEvaluationSchema = z.object({
  metricId: z.int(),
  code: z.string(),
  value: z.number(),
  formattedValue: z.string(),
  unit: z.string().nullable().optional(),
  durationMs: z.int(),
  cacheHit: z.boolean(),
}).meta({ id: 'ReportMetricEvaluation' });

export type ReportMetricEvaluation = z.infer<typeof reportMetricEvaluationSchema>;

export const reportMetricRefsSchema = z.object({
  dashboards: z.array(z.object({ id: z.int(), name: z.string(), widgets: z.array(z.string()) })),
  alerts: z.array(z.object({ id: z.int(), name: z.string() })),
  metrics: z.array(z.object({ id: z.int(), code: z.string(), name: z.string() })),
}).meta({ id: 'ReportMetricRefs' });

export type ReportMetricRefs = z.infer<typeof reportMetricRefsSchema>;

export const reportMetricLookupOptionSchema = z.object({
  id: z.int(),
  name: z.string(),
  code: z.string(),
  status: z.enum(REPORT_METRIC_LIFECYCLE_STATUSES),
  datasetId: z.int(),
  type: z.literal('metric'),
}).meta({ id: 'ReportMetricLookup' });

export type ReportMetricLookupOption = z.infer<typeof reportMetricLookupOptionSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const reportMetricListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  datasetId: idQuery(),
  folderId: idQuery(),
  ownerId: idQuery(),
  type: queryEnum(REPORT_METRIC_TYPES),
  status: queryEnum(REPORT_METRIC_LIFECYCLE_STATUSES),
});

export const reportMetricLookupQuery = z.object({
  keyword: keywordQuery(),
  status: queryEnum(REPORT_METRIC_LIFECYCLE_STATUSES),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const reportMetricContract = defineContract('/api/report/metrics', {
  list: op.get('/', { access: { permission: 'report:metric:list' }, query: reportMetricListQuery, response: paginated(reportMetricSchema), summary: '指标列表' }),
  lookup: op.get('/lookup', { access: { permission: 'report:metric:list' }, query: reportMetricLookupQuery, response: z.array(reportMetricLookupOptionSchema), summary: '指标下拉' }),
  detail: op.get('/{id}', { access: { permission: 'report:metric:list' }, params: idParam, response: reportMetricSchema, summary: '指标详情' }),
  create: op.post('/', { access: { permission: 'report:metric:create' }, audit: '创建指标', body: createReportMetricSchema, response: reportMetricSchema, summary: '创建指标' }),
  update: op.put('/{id}', { access: { permission: 'report:metric:update' }, audit: '更新指标', params: idParam, body: updateReportMetricSchema, response: reportMetricSchema, summary: '更新指标' }),
  evaluate: op.post('/{id}/evaluate', { access: { permission: 'report:metric:evaluate' }, params: idParam, body: reportMetricEvaluateSchema, response: reportMetricEvaluationSchema, summary: '计算指标' }),
  publish: op.post('/{id}/publish', { access: { permission: 'report:metric:publish' }, audit: '发布指标', params: idParam, body: reportMetricLifecycleActionSchema, response: reportMetricSchema, summary: '直接发布指标' }),
  deprecate: op.post('/{id}/deprecate', { access: { permission: 'report:metric:publish' }, audit: '废弃指标', params: idParam, body: reportMetricLifecycleActionSchema, response: reportMetricSchema, summary: '废弃指标' }),
  refs: op.get('/{id}/refs', { access: { permission: 'report:metric:list' }, params: idParam, response: reportMetricRefsSchema, summary: '指标引用' }),
  remove: op.delete('/{id}', { access: { permission: 'report:metric:delete' }, audit: '删除指标', params: idParam, summary: '删除指标' }),
}, { auditModule: '报表指标', tags: ['报表指标'] });
