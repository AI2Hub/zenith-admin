import { http } from 'msw';
import type {
  ReportFillRecord,
  ReportFillTemplate,
  WorkflowFormField,
  WorkflowFormSchema,
} from '@zenith/shared';
import {
  getNextReportDatasetId,
  mockReportDatasets,
} from '@/mocks/data/report';
import {
  mockReportFillRecords,
  mockReportFillTemplates,
  mockReportFolders,
  nextReportP2Id,
} from '@/mocks/data/report-p2';
import { createProgressingMockTask } from './async-tasks';
import { mockDateTime } from '@/mocks/utils/date';
import {
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  matchesNumberParam,
  reportError,
  reportOk,
  reportPage,
} from './report-mock-utils';

function templateView(template: ReportFillTemplate): ReportFillTemplate {
  return {
    ...template,
    folderName: mockReportFolders.find((folder) => folder.id === template.folderId)?.name ?? null,
    ownerName: template.ownerId === DEMO_USER_ID ? DEMO_USER_NAME : null,
  };
}

function recordView(record: ReportFillRecord): ReportFillRecord {
  return {
    ...record,
    templateName: mockReportFillTemplates.find((template) => template.id === record.templateId)?.name ?? record.templateName ?? null,
    submitterName: record.submitterId === DEMO_USER_ID ? DEMO_USER_NAME : record.submitterName ?? null,
  };
}

function visibleFields(schema: WorkflowFormSchema): WorkflowFormField[] {
  return schema.fields.flatMap((field) => {
    if (field.type === 'row') return field.columns?.flatMap((column) => visibleFields({ fields: column.fields })) ?? [];
    if (field.type === 'tabs' || field.type === 'steps') return field.panes?.flatMap((pane) => visibleFields({ fields: pane.fields })) ?? [];
    return [field];
  });
}

function validateRequired(schema: WorkflowFormSchema, data: Record<string, unknown>): string | null {
  const missing = visibleFields(schema).find((field) => {
    if (!field.required || field.hidden || ['description', 'divider', 'group'].includes(field.type)) return false;
    const value = data[field.key];
    return value == null || value === '' || (Array.isArray(value) && value.length === 0);
  });
  return missing ? `请填写「${missing.label}」` : null;
}

function assertRevision(record: ReportFillRecord, expectedRevision: number): ReturnType<typeof reportError> | null {
  return record.revision === expectedRevision ? null : reportError(409, '记录已被其他操作更新，请刷新后重试');
}

function ensureGeneratedDataset(template: ReportFillTemplate) {
  if (template.generatedDatasetId) return template.generatedDatasetId;
  const source = mockReportDatasets[1] ?? mockReportDatasets[0];
  const now = mockDateTime();
  const dataset = {
    ...source,
    id: getNextReportDatasetId(),
    name: `${template.name}数据集`,
    datasourceId: 2,
    type: 'static' as const,
    content: { data: [], columns: [] },
    fields: visibleFields(template.publishedSchema ?? template.formSchema)
      .filter((field) => !['description', 'divider', 'group', 'row', 'tabs', 'steps'].includes(field.type))
      .map((field) => ({ name: field.key, label: field.label, type: field.type === 'number' || field.type === 'amount' ? 'number' as const : 'string' as const })),
    params: [],
    computedFields: [],
    cacheTtl: 0,
    folderId: null,
    ownerId: DEMO_USER_ID,
    remark: `填报模板「${template.name}」自动生成`,
    createdAt: now,
    updatedAt: now,
  };
  mockReportDatasets.push(dataset);
  template.generatedDatasetId = dataset.id;
  template.updatedAt = now;
  return dataset.id;
}

function submitSync(record: ReportFillRecord, template: ReportFillTemplate): void {
  const datasetId = ensureGeneratedDataset(template);
  const task = createProgressingMockTask({
    taskType: 'report-fill-sync',
    title: `同步填报记录 · #${record.id}`,
    payload: { recordId: record.id, templateId: template.id, datasetId },
    totalItems: 3,
  });
  record.generatedDatasetId = datasetId;
  record.syncTaskId = task.id;
  record.syncStatus = 'succeeded';
  record.syncError = null;
  record.syncedAt = mockDateTime();
}

export const reportFillHandlers = [
  http.get('/api/report/fill/templates/lookup', () =>
    reportOk(mockReportFillTemplates.filter((item) => item.status === 'published').map(templateView))),

  http.get('/api/report/fill/templates', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const list = mockReportFillTemplates.filter((item) =>
      (!keyword || item.name.includes(keyword) || item.code.includes(keyword))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status'))
      && matchesNumberParam(url, 'ownerId', item.ownerId)
      && matchesNumberParam(url, 'folderId', item.folderId))
      .map(templateView);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/fill/templates/:id', ({ params }) => {
    const template = mockReportFillTemplates.find((item) => item.id === Number(params.id));
    return template ? reportOk(templateView(template)) : reportError(404, '填报模板不存在');
  }),

  http.post('/api/report/fill/templates', async ({ request }) => {
    const body = await request.json() as Pick<ReportFillTemplate, 'code' | 'name' | 'formSchema'> & Partial<ReportFillTemplate>;
    if (mockReportFillTemplates.some((item) => item.code === body.code)) return reportError(400, '填报模板编码已存在');
    const now = mockDateTime();
    const template: ReportFillTemplate = {
      id: nextReportP2Id('fill-template', mockReportFillTemplates),
      tenantId: DEMO_TENANT_ID,
      folderId: body.folderId ?? null,
      ownerId: body.ownerId ?? DEMO_USER_ID,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      formSchema: body.formSchema,
      publishedSchema: null,
      publishedRevision: null,
      workflowDefinitionId: body.workflowDefinitionId ?? null,
      needReview: body.needReview ?? false,
      generatedDatasetId: null,
      status: 'draft',
      revision: 1,
      publishedAt: null,
      publishedBy: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportFillTemplates.push(template);
    return reportOk(templateView(template), '创建成功');
  }),

  http.put('/api/report/fill/templates/:id', async ({ params, request }) => {
    const template = mockReportFillTemplates.find((item) => item.id === Number(params.id));
    if (!template) return reportError(404, '填报模板不存在');
    if (template.status === 'published') return reportError(409, '请先下线模板再编辑');
    const body = await request.json() as Partial<ReportFillTemplate> & { expectedRevision: number };
    if (body.expectedRevision !== template.revision) return reportError(409, '模板已被其他操作更新');
    const { expectedRevision: _expectedRevision, ...patch } = body;
    Object.assign(template, patch, {
      revision: template.revision + 1,
      updatedBy: DEMO_USER_ID,
      updatedAt: mockDateTime(),
    });
    return reportOk(templateView(template), '更新成功');
  }),

  http.post('/api/report/fill/templates/:id/lifecycle', async ({ params, request }) => {
    const template = mockReportFillTemplates.find((item) => item.id === Number(params.id));
    if (!template) return reportError(404, '填报模板不存在');
    const body = await request.json() as { action: 'publish' | 'offline'; expectedRevision: number; note?: string };
    if (body.expectedRevision !== template.revision) return reportError(409, '模板修订号不匹配');
    if (body.action === 'publish' && template.status === 'published') {
      return reportOk(templateView(template), '操作成功');
    }
    if (body.action === 'offline' && template.status !== 'published') {
      return reportError(409, '仅已发布模板可以下线');
    }
    template.revision += 1;
    template.updatedAt = mockDateTime();
    if (body.action === 'publish') {
      template.status = 'published';
      template.publishedSchema = JSON.parse(JSON.stringify(template.formSchema)) as WorkflowFormSchema;
      template.publishedRevision = template.revision;
      template.publishedAt = template.updatedAt;
      template.publishedBy = DEMO_USER_ID;
    } else {
      template.status = 'disabled';
    }
    return reportOk(templateView(template), '操作成功');
  }),

  http.post('/api/report/fill/templates/:id/clone', async ({ params, request }) => {
    const source = mockReportFillTemplates.find((item) => item.id === Number(params.id));
    if (!source) return reportError(404, '填报模板不存在');
    const body = await request.json() as { code: string; name: string; folderId?: number | null };
    if (mockReportFillTemplates.some((item) => item.code === body.code)) return reportError(400, '填报模板编码已存在');
    const now = mockDateTime();
    const copy: ReportFillTemplate = {
      ...source,
      id: nextReportP2Id('fill-template', mockReportFillTemplates),
      code: body.code,
      name: body.name,
      folderId: body.folderId ?? source.folderId,
      status: 'draft',
      revision: 1,
      publishedSchema: null,
      publishedRevision: null,
      publishedAt: null,
      publishedBy: null,
      generatedDatasetId: null,
      createdAt: now,
      updatedAt: now,
    };
    mockReportFillTemplates.push(copy);
    return reportOk(templateView(copy), '克隆成功');
  }),

  http.delete('/api/report/fill/templates/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportFillTemplates.findIndex((item) => item.id === id);
    if (index < 0) return reportError(404, '填报模板不存在');
    if (mockReportFillTemplates[index].status === 'published') return reportError(409, '请先下线模板再删除');
    if (mockReportFillRecords.some((item) => item.templateId === id)) return reportError(409, '已有填报记录，不能删除模板');
    mockReportFillTemplates.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/fill/records/mine', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const list = mockReportFillRecords.filter((item) =>
      item.submitterId === DEMO_USER_ID
      && (!keyword || (item.templateName ?? '').includes(keyword))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status'))
      && matchesNumberParam(url, 'templateId', item.templateId))
      .map(recordView);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/fill/records/admin', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportFillRecords.filter((item) =>
      (!url.searchParams.get('status') || item.status === url.searchParams.get('status'))
      && matchesNumberParam(url, 'templateId', item.templateId)
      && matchesNumberParam(url, 'submitterId', item.submitterId))
      .map(recordView);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/fill/records/:id', ({ params }) => {
    const record = mockReportFillRecords.find((item) => item.id === Number(params.id));
    if (!record) return reportError(404, '填报记录不存在');
    return reportOk(recordView(record));
  }),

  http.post('/api/report/fill/records', async ({ request }) => {
    const body = await request.json() as { templateId: number; data?: Record<string, unknown> };
    const template = mockReportFillTemplates.find((item) => item.id === body.templateId);
    if (!template) return reportError(404, '填报模板不存在');
    if (template.status !== 'published' || !template.publishedSchema || !template.publishedRevision) {
      return reportError(409, '填报模板未发布或发布快照无效');
    }
    const now = mockDateTime();
    const record: ReportFillRecord = {
      id: nextReportP2Id('fill-record', mockReportFillRecords),
      tenantId: DEMO_TENANT_ID,
      templateId: template.id,
      templateName: template.name,
      submitterId: DEMO_USER_ID,
      submitterName: DEMO_USER_NAME,
      status: 'draft',
      data: body.data ?? {},
      templateRevision: template.publishedRevision,
      templateSchemaSnapshot: JSON.parse(JSON.stringify(template.publishedSchema)) as WorkflowFormSchema,
      templateNeedReview: template.needReview,
      workflowDefinitionIdSnapshot: template.workflowDefinitionId ?? null,
      submitComment: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewComment: null,
      workflowInstanceId: null,
      generatedDatasetId: template.generatedDatasetId ?? null,
      syncStatus: 'pending',
      syncTaskId: null,
      syncError: null,
      syncedAt: null,
      revision: 1,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportFillRecords.unshift(record);
    return reportOk(recordView(record), '创建成功');
  }),

  http.put('/api/report/fill/records/:id', async ({ params, request }) => {
    const record = mockReportFillRecords.find((item) => item.id === Number(params.id) && item.submitterId === DEMO_USER_ID);
    if (!record) return reportError(404, '填报记录不存在');
    if (!['draft', 'rejected'].includes(record.status)) return reportError(409, '当前状态不允许编辑');
    const body = await request.json() as { data: Record<string, unknown>; expectedRevision: number };
    const revisionError = assertRevision(record, body.expectedRevision);
    if (revisionError) return revisionError;
    record.data = body.data;
    record.revision += 1;
    record.status = 'draft';
    record.updatedBy = DEMO_USER_ID;
    record.updatedAt = mockDateTime();
    return reportOk(recordView(record), '更新成功');
  }),

  http.post('/api/report/fill/records/:id/submit', async ({ params, request }) => {
    const record = mockReportFillRecords.find((item) => item.id === Number(params.id) && item.submitterId === DEMO_USER_ID);
    if (!record) return reportError(404, '填报记录不存在');
    if (!['draft', 'rejected'].includes(record.status)) return reportError(409, '当前状态不允许提交');
    const body = await request.json() as { expectedRevision: number; comment?: string };
    const revisionError = assertRevision(record, body.expectedRevision);
    if (revisionError) return revisionError;
    const validationError = validateRequired(record.templateSchemaSnapshot, record.data);
    if (validationError) return reportError(400, validationError);
    const template = mockReportFillTemplates.find((item) => item.id === record.templateId);
    if (!template) return reportError(404, '填报模板不存在');
    const now = mockDateTime();
    record.status = record.templateNeedReview ? 'submitted' : 'approved';
    record.submittedAt = now;
    record.submitComment = body.comment ?? null;
    record.reviewedAt = record.templateNeedReview ? null : now;
    record.reviewedBy = record.templateNeedReview ? null : DEMO_USER_ID;
    record.revision += 1;
    record.updatedAt = now;
    if (record.workflowDefinitionIdSnapshot) {
      record.status = 'in_review';
      record.workflowInstanceId = 10_000 + record.id;
    }
    if (record.status === 'approved') submitSync(record, template);
    return reportOk(recordView(record), '提交成功');
  }),

  http.post('/api/report/fill/records/:id/review', async ({ params, request }) => {
    const record = mockReportFillRecords.find((item) => item.id === Number(params.id));
    if (!record) return reportError(404, '填报记录不存在');
    if (!['submitted', 'in_review'].includes(record.status)) return reportError(409, '当前状态不允许审核');
    if (record.workflowDefinitionIdSnapshot || record.workflowInstanceId) return reportError(409, '该记录必须通过绑定的工作流审批');
    const body = await request.json() as { decision: 'approved' | 'rejected'; expectedRevision: number; comment?: string };
    const revisionError = assertRevision(record, body.expectedRevision);
    if (revisionError) return revisionError;
    const template = mockReportFillTemplates.find((item) => item.id === record.templateId);
    if (!template) return reportError(404, '填报模板不存在');
    record.status = body.decision;
    record.reviewedAt = mockDateTime();
    record.reviewedBy = DEMO_USER_ID;
    record.reviewComment = body.comment ?? null;
    record.revision += 1;
    record.updatedAt = record.reviewedAt;
    if (record.status === 'approved') submitSync(record, template);
    return reportOk(recordView(record), '审核成功');
  }),

  http.post('/api/report/fill/records/:id/:action', async ({ params, request }) => {
    const action = String(params.action);
    if (!['cancel', 'withdraw'].includes(action)) return reportError(404, '操作不存在');
    const record = mockReportFillRecords.find((item) => item.id === Number(params.id) && item.submitterId === DEMO_USER_ID);
    if (!record) return reportError(404, '填报记录不存在');
    if (!['draft', 'rejected', 'submitted', 'in_review'].includes(record.status)) return reportError(409, '当前状态不允许取消或撤回');
    const body = await request.json() as { expectedRevision: number; reason?: string };
    const revisionError = assertRevision(record, body.expectedRevision);
    if (revisionError) return revisionError;
    record.status = 'cancelled';
    record.reviewComment = body.reason ?? null;
    record.revision += 1;
    record.updatedAt = mockDateTime();
    return reportOk(recordView(record), '操作成功');
  }),
];
