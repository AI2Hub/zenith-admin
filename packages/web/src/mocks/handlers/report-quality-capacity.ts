import { http } from 'msw';
import type {
  ReportAssetCatalogItem,
  ReportAssetTemplate,
  ReportAssetTemplateApplyResult,
  ReportAssetUsageSummary,
  ReportDeprecationNotice,
  ReportDqAnomaly,
  ReportDqRule,
  ReportDqRun,
  ReportMaterializationSnapshot,
  ReportQueryQuota,
  ReportResourceType,
  ReportSlaRule,
} from '@zenith/shared';
import {
  getNextReportDashboardId,
  getNextReportDatasetId,
  getNextReportPrintId,
  mockReportDashboards,
  mockReportDatasets,
  mockReportDatasources,
  mockReportPrintTemplates,
} from '@/mocks/data/report';
import {
  mockReportAssetTemplates,
  mockReportDeprecations,
  mockReportDqAnomalies,
  mockReportDqRules,
  mockReportDqRuns,
  mockReportDqScores,
  mockReportFillTemplates,
  mockReportFolders,
  mockReportMetrics,
  mockReportQueryCostLogs,
  mockReportQueryQuotas,
  mockReportSlaRules,
  mockReportSlaViolations,
  mockReportSnapshots,
  nextReportP2Id,
} from '@/mocks/data/report-p2';
import { createProgressingMockTask } from './async-tasks';
import { mockDate, mockDateTime, mockDateTimeOffset } from '@/mocks/utils/date';
import {
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  matchesNumberParam,
  reportError,
  reportOk,
  reportPage,
} from './report-mock-utils';

function dqRuleView(rule: ReportDqRule): ReportDqRule {
  return { ...rule, datasetName: mockReportDatasets.find((item) => item.id === rule.datasetId)?.name ?? null };
}

function validateCustomDqSql(rule: Pick<ReportDqRule, 'type' | 'config'>): string | null {
  if (rule.type !== 'custom_sql') return null;
  const query = rule.config.sql?.trim() ?? '';
  if (!query
    || /;|--|\/\*|\b(with|join|union|intersect|except|lateral|values|table|insert|update|delete|drop|alter|truncate)\b/i.test(query)
    || !/^\s*select\s+(?:[A-Za-z_][\w$]*\.)?row\s+from\s+dataset(?:\s+(?:as\s+)?[A-Za-z_][\w$]*)?(?:\s+where\s+[\s\S]+)?\s*$/i.test(query)) {
    return '自定义质量 SQL 只能使用 SELECT row FROM dataset [WHERE ...] 受限语法';
  }
  return null;
}

function assetCatalog(): ReportAssetCatalogItem[] {
  const folderName = (id: number | null | undefined) => mockReportFolders.find((folder) => folder.id === id)?.name ?? null;
  const map = (
    resourceType: ReportResourceType,
    items: Array<{ id: number; name: string; tenantId?: number | null; ownerId?: number | null; ownerName?: string | null; folderId?: number | null; status?: string; lifecycleStatus?: string; updatedAt: string }>,
  ) => items.map((item): ReportAssetCatalogItem => ({
    resourceType,
    resourceId: item.id,
    tenantId: item.tenantId ?? null,
    name: item.name,
    ownerId: item.ownerId ?? DEMO_USER_ID,
    ownerName: item.ownerName ?? DEMO_USER_NAME,
    folderId: item.folderId ?? null,
    folderName: folderName(item.folderId),
    lifecycleStatus: item.lifecycleStatus ?? null,
    status: item.status ?? null,
    deprecationEffectiveAt: mockReportDeprecations.find((notice) =>
      notice.resourceType === resourceType && notice.resourceId === item.id && notice.publishedAt)?.effectiveAt ?? null,
    updatedAt: item.updatedAt,
  }));
  return [
    ...map('datasource', mockReportDatasources),
    ...map('dataset', mockReportDatasets),
    ...map('dashboard', mockReportDashboards),
    ...map('metric', mockReportMetrics),
    ...map('print_template', mockReportPrintTemplates),
    ...map('fill_template', mockReportFillTemplates),
    ...map('asset_template', mockReportAssetTemplates),
  ];
}

function usageSummary(resourceType: ReportResourceType, resourceId: number): ReportAssetUsageSummary {
  const multiplier = resourceId + resourceType.length;
  const notice = mockReportDeprecations.find((item) =>
    item.resourceType === resourceType && item.resourceId === resourceId && item.publishedAt);
  return {
    resourceType,
    resourceId,
    views: multiplier * 7,
    queries: multiplier * 4,
    exports: multiplier,
    uniqueUsers: Math.max(1, multiplier % 9),
    lastUsedAt: mockDateTimeOffset(-multiplier * 60_000),
    deprecated: Boolean(notice),
    deprecationNotice: notice ?? null,
  };
}

export const reportQualityCapacityHandlers = [
  http.get('/api/report/dq/rules', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportDqRules.filter((item) =>
      matchesNumberParam(url, 'datasetId', item.datasetId)
      && (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
      && (!url.searchParams.has('enabled') || item.enabled === (url.searchParams.get('enabled') === 'true')))
      .map(dqRuleView);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/dq/rules/:id', ({ params }) => {
    const rule = mockReportDqRules.find((item) => item.id === Number(params.id));
    return rule ? reportOk(dqRuleView(rule)) : reportError(404, '质量规则不存在');
  }),

  http.post('/api/report/dq/rules', async ({ request }) => {
    const body = await request.json() as Omit<ReportDqRule, 'id' | 'tenantId' | 'lastRunAt' | 'lastStatus' | 'createdAt' | 'updatedAt'>;
    if (!mockReportDatasets.some((item) => item.id === body.datasetId)) return reportError(404, '数据集不存在');
    const customSqlError = validateCustomDqSql(body);
    if (customSqlError) return reportError(400, customSqlError);
    const now = mockDateTime();
    const rule: ReportDqRule = {
      ...body,
      id: nextReportP2Id('dq-rule', mockReportDqRules),
      tenantId: DEMO_TENANT_ID,
      field: body.field ?? null,
      config: body.config ?? {},
      cron: body.cron ?? null,
      timezone: body.timezone ?? 'Asia/Shanghai',
      enabled: body.enabled ?? true,
      lastRunAt: null,
      lastStatus: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportDqRules.push(rule);
    return reportOk(dqRuleView(rule), '创建成功');
  }),

  http.put('/api/report/dq/rules/:id', async ({ params, request }) => {
    const rule = mockReportDqRules.find((item) => item.id === Number(params.id));
    if (!rule) return reportError(404, '质量规则不存在');
    const body = await request.json() as Partial<ReportDqRule>;
    const customSqlError = validateCustomDqSql({
      type: body.type ?? rule.type,
      config: body.config ?? rule.config,
    });
    if (customSqlError) return reportError(400, customSqlError);
    Object.assign(rule, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(dqRuleView(rule), '更新成功');
  }),

  http.delete('/api/report/dq/rules/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportDqRules.findIndex((item) => item.id === id);
    if (index < 0) return reportError(404, '质量规则不存在');
    mockReportDqRules.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.post('/api/report/dq/rules/:id/toggle', ({ params }) => {
    const rule = mockReportDqRules.find((item) => item.id === Number(params.id));
    if (!rule) return reportError(404, '质量规则不存在');
    rule.enabled = !rule.enabled;
    rule.updatedAt = mockDateTime();
    return reportOk(dqRuleView(rule), rule.enabled ? '已启用' : '已停用');
  }),

  http.post('/api/report/dq/rules/:id/run', async ({ params, request }) => {
    const rule = mockReportDqRules.find((item) => item.id === Number(params.id));
    if (!rule) return reportError(404, '质量规则不存在');
    if (!rule.enabled) return reportError(409, '质量规则已停用');
    const body = await request.json() as { sampleLimit?: number };
    const now = mockDateTime();
    const failedRows = rule.type === 'row_count' ? 1 : 0;
    const run: ReportDqRun = {
      id: nextReportP2Id('dq-run', mockReportDqRuns),
      tenantId: DEMO_TENANT_ID,
      ruleId: rule.id,
      datasetId: rule.datasetId,
      status: 'succeeded',
      triggerType: 'manual',
      checkedRows: 6,
      failedRows,
      passRate: failedRows ? 83.33 : 100,
      sampleRows: failedRows && (body.sampleLimit ?? 20) > 0 ? [{ name: '演示异常行', value: null }] : [],
      sampleRowCount: failedRows,
      sampleBytes: failedRows ? 48 : 0,
      startedAt: now,
      completedAt: now,
      durationMs: 320,
      errorMessage: null,
      schemaSignature: 'demo-department-ranking-v1',
      requestedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportDqRuns.unshift(run);
    rule.lastRunAt = now;
    rule.lastStatus = 'succeeded';
    rule.updatedAt = now;
    mockReportDqScores.unshift({
      id: nextReportP2Id('dq-score', mockReportDqScores),
      tenantId: DEMO_TENANT_ID,
      datasetId: rule.datasetId,
      score: failedRows ? 83.33 : 100,
      passedRules: failedRows ? 1 : 2,
      failedRules: failedRows ? 1 : 0,
      totalRules: 2,
      dimensions: { completeness: failedRows ? 80 : 100, validity: 100 },
      measuredAt: now,
      createdAt: now,
    });
    if (failedRows) {
      mockReportDqAnomalies.unshift({
        id: nextReportP2Id('dq-anomaly', mockReportDqAnomalies),
        tenantId: DEMO_TENANT_ID,
        datasetId: rule.datasetId,
        ruleId: rule.id,
        runId: run.id,
        severity: rule.severity,
        title: `${rule.name}未通过`,
        detail: 'Demo 规则执行产生的示例异常。',
        sample: { failedRows },
        sampleRowCount: failedRows,
        sampleBytes: 48,
        status: 'open',
        acknowledgedAt: null,
        acknowledgedBy: null,
        acknowledgementNote: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return reportOk(createProgressingMockTask({
      taskType: 'report-dq-rule-run',
      title: `执行质量规则 · ${rule.name}`,
      payload: { ruleId: rule.id, runId: run.id, sampleLimit: body.sampleLimit ?? 20 },
      totalItems: 6,
    }), '任务已提交');
  }),

  http.get('/api/report/dq/runs', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportDqRuns.filter((item) =>
      matchesNumberParam(url, 'datasetId', item.datasetId)
      && matchesNumberParam(url, 'ruleId', item.ruleId)
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/dq/datasets/:id/scores', ({ params, request }) =>
    reportOk(reportPage(request, mockReportDqScores.filter((item) => item.datasetId === Number(params.id))))),

  http.get('/api/report/dq/datasets/:id/score', ({ params }) =>
    reportOk(mockReportDqScores.find((item) => item.datasetId === Number(params.id)) ?? null)),

  http.get('/api/report/dq/anomalies', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportDqAnomalies.filter((item) =>
      matchesNumberParam(url, 'datasetId', item.datasetId)
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.post('/api/report/dq/anomalies/:id/status', async ({ params, request }) => {
    const anomaly = mockReportDqAnomalies.find((item) => item.id === Number(params.id));
    if (!anomaly) return reportError(404, '质量异常不存在');
    const body = await request.json() as { status: ReportDqAnomaly['status']; note?: string };
    const now = mockDateTime();
    anomaly.status = body.status;
    anomaly.acknowledgementNote = body.note ?? null;
    if (body.status === 'acknowledged') {
      anomaly.acknowledgedAt = now;
      anomaly.acknowledgedBy = DEMO_USER_ID;
    }
    if (body.status === 'resolved') {
      anomaly.resolvedAt = now;
      anomaly.resolvedBy = DEMO_USER_ID;
    }
    anomaly.updatedAt = now;
    return reportOk(anomaly, '操作成功');
  }),

  http.get('/api/report/materializations/datasets/:id/snapshots', ({ params, request }) => {
    const list = mockReportSnapshots.filter((item) => item.datasetId === Number(params.id));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/materializations/datasets/:id/current', ({ params }) =>
    reportOk(mockReportSnapshots.find((item) => item.datasetId === Number(params.id) && item.status === 'ready') ?? null)),

  http.post('/api/report/materializations/datasets/:id/refresh', async ({ params, request }) => {
    const datasetId = Number(params.id);
    const dataset = mockReportDatasets.find((item) => item.id === datasetId);
    if (!dataset) return reportError(404, '数据集不存在');
    const body = await request.json() as { strategy?: 'full' | 'incremental'; keyField?: string | null; deltaWindowMinutes?: number | null; expiresAt?: string | null };
    const now = mockDateTime();
    const revision = Math.max(0, ...mockReportSnapshots.filter((item) => item.datasetId === datasetId).map((item) => item.revision)) + 1;
    const snapshot: ReportMaterializationSnapshot = {
      id: nextReportP2Id('snapshot', mockReportSnapshots),
      tenantId: DEMO_TENANT_ID,
      datasetId,
      strategy: body.strategy ?? 'full',
      status: 'ready',
      revision,
      keyField: body.keyField ?? null,
      watermark: body.strategy === 'incremental' ? now : null,
      deltaWindowMinutes: body.deltaWindowMinutes ?? null,
      fileId: null,
      rowCount: 6,
      byteSize: 512,
      checksum: `demo-snapshot-${datasetId}-${revision}`,
      startedAt: now,
      completedAt: now,
      expiresAt: body.expiresAt ?? null,
      errorMessage: null,
      createdBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportSnapshots.unshift(snapshot);
    return reportOk(createProgressingMockTask({
      taskType: 'report-dataset-materialize',
      title: `物化数据集 · ${dataset.name}`,
      payload: { datasetId, snapshotId: snapshot.id, strategy: snapshot.strategy },
      totalItems: 8,
    }), '任务已提交');
  }),

  http.delete('/api/report/materializations/snapshots/:id', ({ params }) => {
    const snapshot = mockReportSnapshots.find((item) => item.id === Number(params.id));
    if (!snapshot) return reportError(404, '物化快照不存在');
    snapshot.status = 'deleted';
    snapshot.updatedAt = mockDateTime();
    return reportOk(null, '清除成功');
  }),

  http.delete('/api/report/materializations/datasets/:id/snapshots', ({ params }) => {
    mockReportSnapshots
      .filter((item) => item.datasetId === Number(params.id) && item.status !== 'deleted')
      .forEach((item) => { item.status = 'deleted'; item.updatedAt = mockDateTime(); });
    return reportOk(null, '清除成功');
  }),

  http.get('/api/report/query-capacity/quotas', ({ request }) => reportOk(reportPage(request, mockReportQueryQuotas))),

  http.get('/api/report/query-capacity/quotas/:id', ({ params }) => {
    const quota = mockReportQueryQuotas.find((item) => item.id === Number(params.id));
    return quota ? reportOk(quota) : reportError(404, '查询配额不存在');
  }),

  http.post('/api/report/query-capacity/quotas', async ({ request }) => {
    const body = await request.json() as Omit<ReportQueryQuota, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
    if (mockReportQueryQuotas.some((item) => item.scope === body.scope && item.userId === (body.userId ?? null))) {
      return reportError(409, '该作用域已配置查询配额');
    }
    const now = mockDateTime();
    const quota: ReportQueryQuota = {
      ...body,
      id: nextReportP2Id('quota', mockReportQueryQuotas),
      tenantId: DEMO_TENANT_ID,
      userId: body.userId ?? null,
      resetTimezone: body.resetTimezone ?? 'Asia/Shanghai',
      enabled: body.enabled ?? true,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportQueryQuotas.push(quota);
    return reportOk(quota, '创建成功');
  }),

  http.put('/api/report/query-capacity/quotas/:id', async ({ params, request }) => {
    const quota = mockReportQueryQuotas.find((item) => item.id === Number(params.id));
    if (!quota) return reportError(404, '查询配额不存在');
    const body = await request.json() as Partial<ReportQueryQuota>;
    Object.assign(quota, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(quota, '更新成功');
  }),

  http.delete('/api/report/query-capacity/quotas/:id', ({ params }) => {
    const index = mockReportQueryQuotas.findIndex((item) => item.id === Number(params.id));
    if (index < 0) return reportError(404, '查询配额不存在');
    mockReportQueryQuotas.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/query-capacity/quotas/:id/usage', ({ params, request }) => {
    const quota = mockReportQueryQuotas.find((item) => item.id === Number(params.id));
    if (!quota) return reportError(404, '查询配额不存在');
    const url = new URL(request.url);
    return reportOk({
      tenantId: quota.tenantId,
      userId: quota.userId ?? null,
      timezone: quota.resetTimezone,
      day: url.searchParams.get('scopeDate') ?? mockDate(),
      concurrent: 1,
      queries: 42,
      rows: 2_860,
      bytes: 524_288,
      costUnits: 1.25,
      maxConcurrent: quota.maxConcurrent,
      dailyQueryLimit: quota.dailyQueryLimit,
      dailyRowLimit: quota.dailyRowLimit,
      dailyByteLimit: quota.dailyByteLimit,
      dailyCostLimit: quota.dailyCostLimit,
    });
  }),

  http.post('/api/report/query-capacity/quotas/:id/reset', ({ params }) => {
    if (!mockReportQueryQuotas.some((item) => item.id === Number(params.id))) return reportError(404, '查询配额不存在');
    return reportOk(null, '重置成功');
  }),

  http.get('/api/report/query-capacity/cost-logs', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportQueryCostLogs.filter((item) =>
      matchesNumberParam(url, 'userId', item.userId)
      && matchesNumberParam(url, 'datasetId', item.datasetId)
      && matchesNumberParam(url, 'datasourceId', item.datasourceId)
      && (!url.searchParams.get('scene') || item.scene === url.searchParams.get('scene'))
      && (!url.searchParams.has('success') || item.success === (url.searchParams.get('success') === 'true')));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/query-capacity/cost-stats', () => {
    const queries = mockReportQueryCostLogs.length;
    return reportOk({
      queries,
      rows: mockReportQueryCostLogs.reduce((sum, item) => sum + item.rowCount, 0),
      bytes: mockReportQueryCostLogs.reduce((sum, item) => sum + item.byteSize, 0),
      costUnits: mockReportQueryCostLogs.reduce((sum, item) => sum + item.costUnits, 0),
      avgDurationMs: queries ? mockReportQueryCostLogs.reduce((sum, item) => sum + item.durationMs, 0) / queries : 0,
      failures: mockReportQueryCostLogs.filter((item) => !item.success).length,
      capacity: { globalLimit: 100, running: 1, queueDepth: 0, datasourceQueues: 1 },
    });
  }),

  http.get('/api/report/query-capacity/cost-trend', () => reportOk(
    Array.from({ length: 7 }, (_, index) => ({
      bucket: mockDateTimeOffset(-(6 - index) * 86_400_000),
      queries: 18 + index * 4,
      rows: 900 + index * 120,
      bytes: 120_000 + index * 24_000,
      costUnits: 0.4 + index * 0.08,
      avgDurationMs: 42 - index,
      queueMs: Math.max(0, 6 - index),
    })),
  )),

  http.get('/api/report/sla/rules', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportSlaRules.filter((item) =>
      matchesNumberParam(url, 'datasetId', item.datasetId)
      && (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
      && (!url.searchParams.has('enabled') || item.enabled === (url.searchParams.get('enabled') === 'true')));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/sla/rules/:id', ({ params }) => {
    const rule = mockReportSlaRules.find((item) => item.id === Number(params.id));
    return rule ? reportOk(rule) : reportError(404, 'SLA 规则不存在');
  }),

  http.post('/api/report/sla/rules', async ({ request }) => {
    const body = await request.json() as Omit<ReportSlaRule, 'id' | 'tenantId' | 'lastEvaluatedAt' | 'lastNotifiedAt' | 'createdAt' | 'updatedAt'>;
    const now = mockDateTime();
    const rule: ReportSlaRule = {
      ...body,
      id: nextReportP2Id('sla-rule', mockReportSlaRules),
      tenantId: DEMO_TENANT_ID,
      warningValue: body.warningValue ?? null,
      cron: body.cron ?? null,
      channels: body.channels ?? [],
      recipients: body.recipients ?? null,
      webhookUrl: body.webhookUrl ?? null,
      lastEvaluatedAt: null,
      lastNotifiedAt: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportSlaRules.push(rule);
    return reportOk(rule, '创建成功');
  }),

  http.put('/api/report/sla/rules/:id', async ({ params, request }) => {
    const rule = mockReportSlaRules.find((item) => item.id === Number(params.id));
    if (!rule) return reportError(404, 'SLA 规则不存在');
    const body = await request.json() as Partial<ReportSlaRule>;
    Object.assign(rule, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(rule, '更新成功');
  }),

  http.delete('/api/report/sla/rules/:id', ({ params }) => {
    const index = mockReportSlaRules.findIndex((item) => item.id === Number(params.id));
    if (index < 0) return reportError(404, 'SLA 规则不存在');
    mockReportSlaRules.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.post('/api/report/sla/rules/:id/evaluate', ({ params }) => {
    const rule = mockReportSlaRules.find((item) => item.id === Number(params.id));
    if (!rule) return reportError(404, 'SLA 规则不存在');
    rule.lastEvaluatedAt = mockDateTime();
    rule.updatedAt = rule.lastEvaluatedAt;
    return reportOk(createProgressingMockTask({
      taskType: 'report-sla-rule-evaluate',
      title: `评估 SLA · ${rule.name}`,
      payload: { ruleId: rule.id, datasetId: rule.datasetId },
      totalItems: 4,
    }), '任务已提交');
  }),

  http.get('/api/report/sla/violations', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportSlaViolations.filter((item) =>
      matchesNumberParam(url, 'datasetId', item.datasetId)
      && matchesNumberParam(url, 'ruleId', item.ruleId)
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.post('/api/report/sla/violations/:id/status', async ({ params, request }) => {
    const violation = mockReportSlaViolations.find((item) => item.id === Number(params.id));
    if (!violation) return reportError(404, 'SLA 违规不存在');
    const body = await request.json() as { status: 'acknowledged' | 'resolved'; note?: string };
    const now = mockDateTime();
    violation.status = body.status;
    if (body.status === 'acknowledged') {
      violation.acknowledgedAt = now;
      violation.acknowledgedBy = DEMO_USER_ID;
    } else {
      violation.resolvedAt = now;
      violation.resolvedBy = DEMO_USER_ID;
      violation.resolutionNote = body.note ?? null;
    }
    violation.updatedAt = now;
    return reportOk(violation, '操作成功');
  }),

  http.get('/api/report/assets/catalog', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const types = (url.searchParams.get('types') ?? '').split(',').filter(Boolean);
    const list = assetCatalog().filter((item) =>
      (!keyword || item.name.includes(keyword))
      && (!types.length || types.includes(item.resourceType))
      && matchesNumberParam(url, 'ownerId', item.ownerId)
      && matchesNumberParam(url, 'folderId', item.folderId)
      && (!url.searchParams.get('lifecycle') || item.lifecycleStatus === url.searchParams.get('lifecycle'))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/assets/usage/top', ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 20;
    const list = assetCatalog().map((item) => usageSummary(item.resourceType, item.resourceId))
      .sort((a, b) => b.views - a.views).slice(0, limit);
    return reportOk(list);
  }),

  http.get('/api/report/assets/usage/inactive', ({ request }) => {
    const list = assetCatalog().filter((item) => item.resourceId % 2 === 0);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/assets/usage/trend', () => reportOk(
    Array.from({ length: 7 }, (_, index) => ({
      bucket: mockDateTimeOffset(-(6 - index) * 86_400_000),
      views: 20 + index * 5,
      queries: 12 + index * 3,
      exports: 2 + index,
      embeds: 1 + index,
      shares: index,
      uniqueUsers: 5 + index,
    })),
  )),

  http.get('/api/report/assets/usage/:resourceType/:id', ({ params }) => {
    const resourceType = String(params.resourceType) as ReportResourceType;
    const resourceId = Number(params.id);
    if (!assetCatalog().some((item) => item.resourceType === resourceType && item.resourceId === resourceId)) {
      return reportError(404, '报表资产不存在');
    }
    return reportOk(usageSummary(resourceType, resourceId));
  }),

  http.get('/api/report/assets/deprecations', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportDeprecations.filter((item) =>
      (!url.searchParams.get('resourceType') || item.resourceType === url.searchParams.get('resourceType'))
      && matchesNumberParam(url, 'resourceId', item.resourceId)
      && (!url.searchParams.has('published') || Boolean(item.publishedAt) === (url.searchParams.get('published') === 'true')));
    return reportOk(reportPage(request, list));
  }),

  http.post('/api/report/assets/deprecations', async ({ request }) => {
    const body = await request.json() as Omit<ReportDeprecationNotice, 'id' | 'tenantId' | 'publishedAt' | 'publishedBy' | 'processedAt' | 'createdAt' | 'updatedAt'>;
    if (!assetCatalog().some((item) => item.resourceType === body.resourceType && item.resourceId === body.resourceId)) {
      return reportError(404, '报表资产不存在');
    }
    const now = mockDateTime();
    const notice: ReportDeprecationNotice = {
      ...body,
      id: nextReportP2Id('deprecation', mockReportDeprecations),
      tenantId: DEMO_TENANT_ID,
      replacementResourceType: body.replacementResourceType ?? null,
      replacementResourceId: body.replacementResourceId ?? null,
      expiresAt: body.expiresAt ?? null,
      publishedAt: null,
      publishedBy: null,
      processedAt: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportDeprecations.unshift(notice);
    return reportOk(notice, '创建成功');
  }),

  http.put('/api/report/assets/deprecations/:id', async ({ params, request }) => {
    const notice = mockReportDeprecations.find((item) => item.id === Number(params.id));
    if (!notice) return reportError(404, '弃用公告不存在');
    if (notice.publishedAt) return reportError(409, '已发布公告不能编辑');
    const body = await request.json() as Partial<ReportDeprecationNotice>;
    Object.assign(notice, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(notice, '更新成功');
  }),

  http.post('/api/report/assets/deprecations/:id/publish', async ({ params, request }) => {
    const notice = mockReportDeprecations.find((item) => item.id === Number(params.id));
    if (!notice) return reportError(404, '弃用公告不存在');
    const body = await request.json() as { publish?: boolean };
    notice.publishedAt = body.publish === false ? null : mockDateTime();
    notice.publishedBy = body.publish === false ? null : DEMO_USER_ID;
    notice.updatedAt = mockDateTime();
    return reportOk(notice, body.publish === false ? '已撤销发布' : '发布成功');
  }),

  http.delete('/api/report/assets/deprecations/:id', ({ params }) => {
    const index = mockReportDeprecations.findIndex((item) => item.id === Number(params.id));
    if (index < 0) return reportError(404, '弃用公告不存在');
    mockReportDeprecations.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/assets/templates', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const list = mockReportAssetTemplates.filter((item) =>
      (!keyword || item.name.includes(keyword) || item.code.includes(keyword))
      && (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/assets/templates/:id', ({ params }) => {
    const template = mockReportAssetTemplates.find((item) => item.id === Number(params.id));
    return template ? reportOk(template) : reportError(404, '资产模板不存在');
  }),

  http.post('/api/report/assets/templates', async ({ request }) => {
    const body = await request.json() as Omit<ReportAssetTemplate, 'id' | 'tenantId' | 'version' | 'usageCount' | 'createdAt' | 'updatedAt'>;
    if (mockReportAssetTemplates.some((item) => item.code === body.code)) return reportError(409, '模板编码已存在');
    const now = mockDateTime();
    const template: ReportAssetTemplate = {
      ...body,
      id: nextReportP2Id('asset-template', mockReportAssetTemplates),
      tenantId: DEMO_TENANT_ID,
      folderId: body.folderId ?? null,
      folderName: mockReportFolders.find((item) => item.id === body.folderId)?.name ?? null,
      ownerId: body.ownerId ?? DEMO_USER_ID,
      ownerName: DEMO_USER_NAME,
      previewFileId: body.previewFileId ?? null,
      version: 1,
      usageCount: 0,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportAssetTemplates.push(template);
    return reportOk(template, '创建成功');
  }),

  http.put('/api/report/assets/templates/:id', async ({ params, request }) => {
    const template = mockReportAssetTemplates.find((item) => item.id === Number(params.id));
    if (!template) return reportError(404, '资产模板不存在');
    const body = await request.json() as Partial<ReportAssetTemplate>;
    Object.assign(template, body, { version: template.version + 1, updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(template, '更新成功');
  }),

  http.post('/api/report/assets/templates/:id/clone', async ({ params, request }) => {
    const source = mockReportAssetTemplates.find((item) => item.id === Number(params.id));
    if (!source) return reportError(404, '资产模板不存在');
    const body = await request.json() as { name: string; folderId?: number | null };
    const now = mockDateTime();
    const copy: ReportAssetTemplate = {
      ...source,
      id: nextReportP2Id('asset-template', mockReportAssetTemplates),
      code: `${source.code}_copy_${mockReportAssetTemplates.length + 1}`,
      name: body.name,
      folderId: body.folderId ?? source.folderId,
      folderName: mockReportFolders.find((item) => item.id === (body.folderId ?? source.folderId))?.name ?? null,
      version: 1,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    mockReportAssetTemplates.push(copy);
    return reportOk(copy, '克隆成功');
  }),

  http.post('/api/report/assets/templates/:id/apply', async ({ params, request }) => {
    const template = mockReportAssetTemplates.find((item) => item.id === Number(params.id));
    if (!template) return reportError(404, '资产模板不存在');
    if (template.status !== 'enabled') return reportError(409, '资产模板已停用');
    const body = await request.json() as { name?: string; folderId?: number | null; targetResourceId?: number };
    let result: ReportAssetTemplateApplyResult;
    if (template.type === 'semantic_model') {
      const source = mockReportDatasets[0];
      const created = { ...source, id: getNextReportDatasetId(), name: body.name ?? template.name, folderId: body.folderId ?? template.folderId, ownerId: DEMO_USER_ID, createdAt: mockDateTime(), updatedAt: mockDateTime() };
      mockReportDatasets.push(created);
      result = { resourceType: 'dataset', resourceId: created.id, name: created.name };
    } else if (template.type === 'print') {
      const source = mockReportPrintTemplates[0];
      const created = { ...source, id: getNextReportPrintId(), name: body.name ?? template.name, folderId: body.folderId ?? template.folderId, ownerId: DEMO_USER_ID, createdAt: mockDateTime(), updatedAt: mockDateTime() };
      mockReportPrintTemplates.push(created);
      result = { resourceType: 'print_template', resourceId: created.id, name: created.name };
    } else if (template.type === 'widget') {
      const dashboard = mockReportDashboards.find((item) => item.id === body.targetResourceId);
      if (!dashboard) return reportError(400, '应用组件模板必须指定目标仪表盘');
      const widgetId = `tpl_${template.id}_${dashboard.widgets.length + 1}`;
      dashboard.widgets.push({ i: widgetId, type: 'text', title: template.name, options: { text: '模板组件' } });
      dashboard.layout.push({ i: widgetId, x: 0, y: dashboard.layout.length * 4, w: 6, h: 4 });
      dashboard.revision += 1;
      dashboard.updatedAt = mockDateTime();
      result = { resourceType: 'dashboard', resourceId: dashboard.id, name: dashboard.name };
    } else {
      const source = mockReportDashboards[0];
      const created = { ...source, id: getNextReportDashboardId(), name: body.name ?? template.name, folderId: body.folderId ?? template.folderId, ownerId: DEMO_USER_ID, layout: [], canvasLayout: [], widgets: [], filters: [], lifecycleStatus: 'draft' as const, revision: 1, publishedSnapshot: null, publishedAt: null, publishedBy: null, publishedByName: null, createdAt: mockDateTime(), updatedAt: mockDateTime() };
      mockReportDashboards.push(created);
      result = { resourceType: 'dashboard', resourceId: created.id, name: created.name };
    }
    template.usageCount += 1;
    template.updatedAt = mockDateTime();
    return reportOk(result, '应用成功');
  }),

  http.delete('/api/report/assets/templates/:id', ({ params }) => {
    const index = mockReportAssetTemplates.findIndex((item) => item.id === Number(params.id));
    if (index < 0) return reportError(404, '资产模板不存在');
    mockReportAssetTemplates.splice(index, 1);
    return reportOk(null, '删除成功');
  }),
];
