import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

const ReportFieldDTO = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean']),
});

const ReportGridItemDTO = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  minH: z.number().optional(),
});

const ReportCanvasItemDTO = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  z: z.number().optional(),
});

const ReportComputedFieldDTO = z.object({
  name: z.string(),
  label: z.string(),
  expression: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean']).optional(),
});

const ReportDatasetParamDTO = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean']),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const ReportWidgetDTO = z.object({
  i: z.string(),
  type: z.enum(['kpi', 'table', 'pivot', 'text', 'bar', 'line', 'area', 'dualAxis', 'pie', 'scatter', 'radar', 'funnel', 'gauge', 'treemap', 'flipper', 'scrollList', 'map']),
  title: z.string(),
  datasetId: z.number().int().nullable().optional(),
  options: z.record(z.string(), z.unknown()),
  paramBindings: z.array(z.object({ filterId: z.string(), param: z.string() })).optional(),
  interaction: z.record(z.string(), z.unknown()).optional(),
  drilldown: z.record(z.string(), z.unknown()).optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

const ReportFilterDTO = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['date', 'daterange', 'select', 'multiSelect', 'input', 'numberRange']),
  defaultValue: z.unknown().optional(),
  optionSource: z.record(z.string(), z.unknown()).optional(),
  width: z.number().optional(),
});

export const ReportDatasourceDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    type: z.enum(['api', 'sql', 'mysql', 'postgresql']),
    config: z.record(z.string(), z.unknown()),
    status: z.enum(['enabled', 'disabled']),
    remark: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDatasource');

export const ReportDatasetDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    datasourceId: z.number().int(),
    datasourceName: z.string().nullable().optional(),
    type: z.enum(['api', 'sql', 'mysql', 'postgresql']),
    content: z.record(z.string(), z.unknown()),
    fields: z.array(ReportFieldDTO),
    params: z.array(ReportDatasetParamDTO),
    computedFields: z.array(ReportComputedFieldDTO),
    cacheTtl: z.number().int(),
    status: z.enum(['enabled', 'disabled']),
    remark: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDataset');

export const ReportDashboardDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    layout: z.array(ReportGridItemDTO),
    canvasLayout: z.array(ReportCanvasItemDTO),
    widgets: z.array(ReportWidgetDTO),
    filters: z.array(ReportFilterDTO),
    config: z.record(z.string(), z.unknown()),
    categoryId: z.number().int().nullable().optional(),
    categoryName: z.string().nullable().optional(),
    favorited: z.boolean().optional(),
    status: z.enum(['enabled', 'disabled']),
    remark: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDashboard');

/** 数据集取数结果 */
export const ReportDataResultDTO = z
  .object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
    total: z.number().nullable().optional(),
  })
  .openapi('ReportDataResult');

/** 仪表盘批量取数结果：{ [widgetId]: ReportDataResult } */
export const ReportDashboardDataDTO = z.record(z.string(), ReportDataResultDTO).openapi('ReportDashboardData');

export const ReportDashboardCategoryDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    sort: z.number().int(),
    remark: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDashboardCategory');

export const ReportDashboardVersionDTO = z
  .object({
    id: z.number().int(),
    dashboardId: z.number().int(),
    version: z.number().int(),
    snapshot: z.record(z.string(), z.unknown()),
    remark: z.string().nullable().optional(),
    createdBy: z.number().int().nullable().optional(),
    createdAt: z.string(),
  })
  .openapi('ReportDashboardVersion');

export const ReportDashboardShareDTO = z
  .object({
    id: z.number().int(),
    dashboardId: z.number().int(),
    token: z.string(),
    enabled: z.boolean(),
    hasPassword: z.boolean().optional(),
    expireAt: z.string().nullable().optional(),
    createdBy: z.number().int().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDashboardShare');

export const ReportDashboardSubscriptionDTO = z
  .object({
    id: z.number().int(),
    dashboardId: z.number().int(),
    dashboardName: z.string().nullable().optional(),
    cron: z.string(),
    channels: z.array(z.enum(['email', 'inApp'])),
    recipients: z.string().nullable().optional(),
    enabled: z.boolean(),
    remark: z.string().nullable().optional(),
    lastRunAt: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ReportDashboardSubscription');

export const ReportPublicDashboardDTO = z
  .object({
    name: z.string(),
    layout: z.array(ReportGridItemDTO),
    canvasLayout: z.array(ReportCanvasItemDTO),
    widgets: z.array(ReportWidgetDTO),
    filters: z.array(ReportFilterDTO),
    config: z.record(z.string(), z.unknown()),
  })
  .openapi('ReportPublicDashboard');

/** 数据源连接测试结果 */
export const ReportDatasourceTestResultDTO = z
  .object({ ok: z.boolean(), message: z.string(), latencyMs: z.number().optional() })
  .openapi('ReportDatasourceTestResult');
