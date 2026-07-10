import { http } from 'msw';
import type {
  ReportAclRole,
  ReportEnvironment,
  ReportEnvironmentPromotion,
  ReportFolder,
  ReportFolderTreeNode,
  ReportMetric,
  ReportPublishApproval,
  ReportResourceAcl,
  ReportResourceTransfer,
  ReportResourceType,
} from '@zenith/shared';
import {
  mockReportDashboards,
  mockReportDatasets,
  mockReportDatasources,
  mockReportPrintTemplates,
  getMockDatasetData,
} from '@/mocks/data/report';
import {
  mockReportAssetTemplates,
  mockReportEnvironments,
  mockReportFillTemplates,
  mockReportFolders,
  mockReportMetrics,
  mockReportPromotions,
  mockReportPublishApprovals,
  mockReportResourceAcls,
  mockReportResourceTransfers,
  nextReportP2Id,
} from '@/mocks/data/report-p2';
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

type MutableResource = {
  id: number;
  name: string;
  ownerId?: number | null;
  ownerName?: string | null;
  folderId?: number | null;
  status?: string;
  updatedAt: string;
};

function resourceList(type: ReportResourceType): MutableResource[] {
  switch (type) {
    case 'datasource': return mockReportDatasources;
    case 'dataset': return mockReportDatasets;
    case 'dashboard': return mockReportDashboards;
    case 'metric': return mockReportMetrics;
    case 'print_template': return mockReportPrintTemplates;
    case 'fill_template': return mockReportFillTemplates;
    case 'asset_template': return mockReportAssetTemplates;
  }
}

function findResource(type: ReportResourceType, id: number): MutableResource | undefined {
  return resourceList(type).find((item) => item.id === id);
}

function folderTree(resourceType?: string): ReportFolderTreeNode[] {
  const rows = mockReportFolders
    .filter((folder) => (!resourceType || folder.resourceType === resourceType) && folder.status === 'enabled')
    .sort((a, b) => a.sort - b.sort || a.id - b.id);
  const build = (parentId: number | null): ReportFolderTreeNode[] => rows
    .filter((folder) => folder.parentId === parentId)
    .map((folder) => ({
      ...folder,
      ownerName: folder.ownerId === DEMO_USER_ID ? DEMO_USER_NAME : null,
      resourceCount: resourceList(folder.resourceType).filter((resource) => resource.folderId === folder.id).length,
      children: build(folder.id),
    }));
  return build(null);
}

function metricView(metric: ReportMetric): ReportMetric {
  const folder = mockReportFolders.find((item) => item.id === metric.folderId);
  const dataset = mockReportDatasets.find((item) => item.id === metric.datasetId);
  return {
    ...metric,
    folderName: folder?.name ?? null,
    ownerName: metric.ownerId === DEMO_USER_ID ? DEMO_USER_NAME : null,
    datasetName: dataset?.name ?? null,
  };
}

function roleAllows(actual: ReportAclRole, required: ReportAclRole): boolean {
  const weights: Record<ReportAclRole, number> = { viewer: 1, editor: 2, owner: 3 };
  return weights[actual] >= weights[required];
}

function hasAccess(resourceType: ReportResourceType, resourceId: number, requiredRole: ReportAclRole): boolean {
  const resource = findResource(resourceType, resourceId);
  if (!resource) return false;
  if (resource.ownerId == null || resource.ownerId === DEMO_USER_ID) return true;
  return mockReportResourceAcls.some((acl) =>
    acl.resourceType === resourceType
    && acl.resourceId === resourceId
    && acl.subjectType === 'user'
    && acl.subjectId === DEMO_USER_ID
    && roleAllows(acl.role, requiredRole)
    && (!acl.expiresAt || acl.expiresAt >= mockDateTime()));
}

function filterGovernance<T extends { resourceType: ReportResourceType; status: string }>(request: Request, source: T[]) {
  const url = new URL(request.url);
  const resourceType = url.searchParams.get('resourceType');
  const status = url.searchParams.get('status');
  return source.filter((item) => (!resourceType || item.resourceType === resourceType) && (!status || item.status === status));
}

export const reportPlatformHandlers = [
  http.get('/api/report/folders/tree', ({ request }) => {
    const url = new URL(request.url);
    return reportOk(folderTree(url.searchParams.get('resourceType') ?? undefined));
  }),

  http.get('/api/report/folders/:id', ({ params }) => {
    const folder = mockReportFolders.find((item) => item.id === Number(params.id));
    return folder ? reportOk({ ...folder, ownerName: folder.ownerId === DEMO_USER_ID ? DEMO_USER_NAME : null }) : reportError(404, '资源目录不存在');
  }),

  http.post('/api/report/folders', async ({ request }) => {
    const body = await request.json() as Pick<ReportFolder, 'name' | 'resourceType'> & Partial<ReportFolder>;
    if (body.parentId && !mockReportFolders.some((item) => item.id === body.parentId && item.resourceType === body.resourceType)) {
      return reportError(400, '父目录不存在或资源类型不一致');
    }
    const now = mockDateTime();
    const folder: ReportFolder = {
      id: nextReportP2Id('folder', mockReportFolders),
      tenantId: DEMO_TENANT_ID,
      parentId: body.parentId ?? null,
      name: body.name,
      resourceType: body.resourceType,
      ownerId: body.ownerId ?? DEMO_USER_ID,
      sort: body.sort ?? 0,
      status: body.status ?? 'enabled',
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportFolders.push(folder);
    return reportOk(folder, '创建成功');
  }),

  http.put('/api/report/folders/:id', async ({ params, request }) => {
    const folder = mockReportFolders.find((item) => item.id === Number(params.id));
    if (!folder) return reportError(404, '资源目录不存在');
    const body = await request.json() as Partial<Pick<ReportFolder, 'name' | 'ownerId' | 'sort' | 'status'>>;
    Object.assign(folder, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(folder, '更新成功');
  }),

  http.post('/api/report/folders/:id/move', async ({ params, request }) => {
    const folder = mockReportFolders.find((item) => item.id === Number(params.id));
    if (!folder) return reportError(404, '资源目录不存在');
    const body = await request.json() as { parentId: number | null; sort?: number };
    if (body.parentId === folder.id) return reportError(400, '目录不能移动到自身');
    const parent = body.parentId ? mockReportFolders.find((item) => item.id === body.parentId) : null;
    if (body.parentId && (!parent || parent.resourceType !== folder.resourceType)) return reportError(400, '目标父目录不存在或资源类型不一致');
    folder.parentId = body.parentId;
    folder.sort = body.sort ?? folder.sort;
    folder.updatedAt = mockDateTime();
    return reportOk(folder, '移动成功');
  }),

  http.delete('/api/report/folders/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportFolders.findIndex((item) => item.id === id);
    if (index < 0) return reportError(404, '资源目录不存在');
    if (mockReportFolders.some((item) => item.parentId === id) || resourceList(mockReportFolders[index].resourceType).some((item) => item.folderId === id)) {
      return reportError(409, '目录非空，不能删除');
    }
    mockReportFolders.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/metrics/lookup', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const status = url.searchParams.get('status');
    const limit = Number(url.searchParams.get('limit')) || 50;
    const list = mockReportMetrics
      .filter((item) => (!keyword || item.name.includes(keyword) || item.code.includes(keyword)) && (!status || item.lifecycleStatus === status))
      .slice(0, limit)
      .map((item) => ({ id: item.id, name: item.name, code: item.code, status: item.lifecycleStatus, datasetId: item.datasetId, type: 'metric' as const }));
    return reportOk(list);
  }),

  http.get('/api/report/metrics', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const list = mockReportMetrics.filter((item) =>
      (!keyword || item.name.includes(keyword) || item.code.includes(keyword))
      && matchesNumberParam(url, 'datasetId', item.datasetId)
      && matchesNumberParam(url, 'folderId', item.folderId)
      && matchesNumberParam(url, 'ownerId', item.ownerId)
      && (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
      && (!url.searchParams.get('status') || item.lifecycleStatus === url.searchParams.get('status')))
      .map(metricView);
    return reportOk(reportPage(request, list));
  }),

  http.get('/api/report/metrics/:id/refs', ({ params }) => {
    const metric = mockReportMetrics.find((item) => item.id === Number(params.id));
    if (!metric) return reportError(404, '指标不存在');
    const dashboards = mockReportDashboards.flatMap((dashboard) => {
      const widgets = dashboard.widgets.filter((widget) => widget.metricId === metric.id).map((widget) => widget.i);
      return widgets.length ? [{ id: dashboard.id, name: dashboard.name, widgets }] : [];
    });
    const metrics = mockReportMetrics
      .filter((item) => item.id !== metric.id && (item.formula ?? '').includes(metric.code))
      .map((item) => ({ id: item.id, code: item.code, name: item.name }));
    return reportOk({ dashboards, alerts: [], metrics });
  }),

  http.get('/api/report/metrics/:id', ({ params }) => {
    const metric = mockReportMetrics.find((item) => item.id === Number(params.id));
    return metric ? reportOk(metricView(metric)) : reportError(404, '指标不存在');
  }),

  http.post('/api/report/metrics', async ({ request }) => {
    const body = await request.json() as Omit<ReportMetric, 'id' | 'tenantId' | 'lifecycleStatus' | 'revision' | 'createdAt' | 'updatedAt'>;
    if (mockReportMetrics.some((item) => item.code === body.code)) return reportError(409, '指标编码已存在');
    const now = mockDateTime();
    const metric: ReportMetric = {
      ...body,
      id: nextReportP2Id('metric', mockReportMetrics),
      tenantId: DEMO_TENANT_ID,
      folderId: body.folderId ?? null,
      ownerId: body.ownerId ?? DEMO_USER_ID,
      dimensions: body.dimensions ?? [],
      lifecycleStatus: 'draft',
      revision: 1,
      publishedSnapshot: null,
      publishedAt: null,
      publishedBy: null,
      deprecatedAt: null,
      deprecatedBy: null,
      deprecationReason: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportMetrics.push(metric);
    return reportOk(metricView(metric), '创建成功');
  }),

  http.put('/api/report/metrics/:id', async ({ params, request }) => {
    const metric = mockReportMetrics.find((item) => item.id === Number(params.id));
    if (!metric) return reportError(404, '指标不存在');
    const body = await request.json() as Partial<ReportMetric> & { expectedRevision: number };
    if (body.expectedRevision !== metric.revision) return reportError(409, '指标已被其他用户修改');
    const { expectedRevision: _expectedRevision, ...patch } = body;
    Object.assign(metric, patch, { revision: metric.revision + 1, updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(metricView(metric), '更新成功');
  }),

  http.post('/api/report/metrics/:id/evaluate', ({ params }) => {
    const metric = mockReportMetrics.find((item) => item.id === Number(params.id));
    if (!metric) return reportError(404, '指标不存在');
    const data = getMockDatasetData(metric.datasetId);
    const values = data.rows.map((row) => Number(row[metric.sourceField ?? 'value'] ?? 0)).filter(Number.isFinite);
    const value = metric.aggregate === 'avg'
      ? values.reduce((sum, item) => sum + item, 0) / Math.max(values.length, 1)
      : values.reduce((sum, item) => sum + item, 0);
    return reportOk({
      metricId: metric.id,
      code: metric.code,
      value,
      formattedValue: new Intl.NumberFormat('zh-CN').format(value),
      unit: metric.unit ?? null,
      durationMs: 18,
      cacheHit: true,
    });
  }),

  http.post('/api/report/metrics/:id/:action', async ({ params, request }) => {
    const metric = mockReportMetrics.find((item) => item.id === Number(params.id));
    if (!metric) return reportError(404, '指标不存在');
    const action = String(params.action);
    if (!['publish', 'deprecate'].includes(action)) return reportError(404, '操作不存在');
    const body = await request.json() as { expectedRevision: number; reason?: string };
    if (body.expectedRevision !== metric.revision) return reportError(409, '指标修订号不匹配');
    metric.revision += 1;
    metric.updatedAt = mockDateTime();
    if (action === 'publish') {
      metric.lifecycleStatus = 'published';
      metric.publishedAt = metric.updatedAt;
      metric.publishedBy = DEMO_USER_ID;
      metric.publishedSnapshot = {
        code: metric.code, name: metric.name, type: metric.type, datasetId: metric.datasetId,
        sourceField: metric.sourceField, formula: metric.formula, aggregate: metric.aggregate,
        dimensions: metric.dimensions, unit: metric.unit, format: metric.format,
      };
    } else {
      metric.lifecycleStatus = 'deprecated';
      metric.deprecatedAt = metric.updatedAt;
      metric.deprecatedBy = DEMO_USER_ID;
      metric.deprecationReason = body.reason ?? 'Demo 生命周期操作';
    }
    return reportOk(metricView(metric), '操作成功');
  }),

  http.delete('/api/report/metrics/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportMetrics.findIndex((item) => item.id === id);
    if (index < 0) return reportError(404, '指标不存在');
    if (mockReportMetrics[index].lifecycleStatus === 'published') return reportError(409, '已发布指标不能删除');
    mockReportMetrics.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/governance/acls', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportResourceAcls.filter((item) =>
      item.resourceType === url.searchParams.get('resourceType')
      && item.resourceId === Number(url.searchParams.get('resourceId'))
      && (!url.searchParams.has('inheritFromFolder') || item.inheritFromFolder === (url.searchParams.get('inheritFromFolder') === 'true')));
    return reportOk(list);
  }),

  http.post('/api/report/governance/acls', async ({ request }) => {
    const body = await request.json() as Omit<ReportResourceAcl, 'id' | 'tenantId' | 'grantedBy' | 'createdAt' | 'updatedAt'>;
    if (!findResource(body.resourceType, body.resourceId)) return reportError(404, '资源不存在');
    if (!hasAccess(body.resourceType, body.resourceId, 'owner')) return reportError(403, '仅资源所有者可授权');
    const now = mockDateTime();
    const acl: ReportResourceAcl = {
      ...body,
      id: nextReportP2Id('acl', mockReportResourceAcls),
      tenantId: DEMO_TENANT_ID,
      inheritFromFolder: body.inheritFromFolder ?? false,
      expiresAt: body.expiresAt ?? null,
      grantedBy: DEMO_USER_ID,
      grantedByName: DEMO_USER_NAME,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportResourceAcls.push(acl);
    return reportOk(acl, '授权成功');
  }),

  http.put('/api/report/governance/acls/:id', async ({ params, request }) => {
    const acl = mockReportResourceAcls.find((item) => item.id === Number(params.id));
    if (!acl) return reportError(404, '授权记录不存在');
    const body = await request.json() as Partial<Pick<ReportResourceAcl, 'role' | 'inheritFromFolder' | 'expiresAt'>>;
    Object.assign(acl, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(acl, '更新成功');
  }),

  http.delete('/api/report/governance/acls/:id', ({ params }) => {
    const index = mockReportResourceAcls.findIndex((item) => item.id === Number(params.id));
    if (index < 0) return reportError(404, '授权记录不存在');
    mockReportResourceAcls.splice(index, 1);
    return reportOk(null, '撤销成功');
  }),

  http.post('/api/report/governance/access/check', async ({ request }) => {
    const body = await request.json() as { resourceType: ReportResourceType; resourceId: number; requiredRole: ReportAclRole };
    return reportOk({ allowed: hasAccess(body.resourceType, body.resourceId, body.requiredRole), requiredRole: body.requiredRole });
  }),

  http.get('/api/report/governance/approvals', ({ request }) =>
    reportOk(reportPage(request, filterGovernance(request, mockReportPublishApprovals)))),

  http.post('/api/report/governance/approvals', async ({ request }) => {
    const body = await request.json() as Pick<ReportPublishApproval, 'resourceType' | 'resourceId' | 'action' | 'requestedRevision' | 'snapshot'>;
    const resource = findResource(body.resourceType, body.resourceId);
    if (!resource) return reportError(404, '资源不存在');
    const now = mockDateTime();
    const approval: ReportPublishApproval = {
      ...body,
      id: nextReportP2Id('approval', mockReportPublishApprovals),
      tenantId: DEMO_TENANT_ID,
      resourceName: resource.name,
      status: 'pending',
      requestedBy: DEMO_USER_ID,
      requestedByName: DEMO_USER_NAME,
      requestedAt: now,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      decisionNote: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportPublishApprovals.unshift(approval);
    return reportOk(approval, '申请成功');
  }),

  http.post('/api/report/governance/approvals/:id/decision', async ({ params, request }) => {
    const approval = mockReportPublishApprovals.find((item) => item.id === Number(params.id));
    if (!approval) return reportError(404, '审批不存在');
    if (approval.status !== 'pending') return reportError(409, '审批已处理');
    const body = await request.json() as { decision: 'approved' | 'rejected'; note?: string };
    approval.status = body.decision;
    approval.decidedBy = DEMO_USER_ID;
    approval.decidedByName = DEMO_USER_NAME;
    approval.decidedAt = mockDateTime();
    approval.decisionNote = body.note ?? null;
    approval.updatedAt = approval.decidedAt;
    return reportOk(approval, '审批完成');
  }),

  http.post('/api/report/governance/approvals/:id/cancel', async ({ params, request }) => {
    const approval = mockReportPublishApprovals.find((item) => item.id === Number(params.id));
    if (!approval) return reportError(404, '审批不存在');
    if (approval.status !== 'pending' || approval.requestedBy !== DEMO_USER_ID) return reportError(403, '不能取消该审批');
    const body = await request.json() as { reason?: string };
    approval.status = 'cancelled';
    approval.decisionNote = body.reason ?? null;
    approval.updatedAt = mockDateTime();
    return reportOk(approval, '已取消');
  }),

  http.get('/api/report/governance/transfers', ({ request }) =>
    reportOk(reportPage(request, filterGovernance(request, mockReportResourceTransfers)))),

  http.post('/api/report/governance/transfers', async ({ request }) => {
    const body = await request.json() as Pick<ReportResourceTransfer, 'resourceType' | 'resourceId' | 'toOwnerId' | 'reason'>;
    const resource = findResource(body.resourceType, body.resourceId);
    if (!resource) return reportError(404, '资源不存在');
    if (!hasAccess(body.resourceType, body.resourceId, 'owner')) return reportError(403, '仅资源所有者可转移');
    const now = mockDateTime();
    const transfer: ReportResourceTransfer = {
      ...body,
      id: nextReportP2Id('transfer', mockReportResourceTransfers),
      tenantId: DEMO_TENANT_ID,
      resourceName: resource.name,
      fromOwnerId: resource.ownerId ?? null,
      fromOwnerName: resource.ownerId === DEMO_USER_ID ? DEMO_USER_NAME : null,
      toOwnerName: body.toOwnerId === DEMO_USER_ID ? DEMO_USER_NAME : `用户 ${body.toOwnerId}`,
      status: 'pending',
      requestedBy: DEMO_USER_ID,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportResourceTransfers.unshift(transfer);
    return reportOk(transfer, '转移申请已创建');
  }),

  http.post('/api/report/governance/transfers/:id/decision', async ({ params, request }) => {
    const transfer = mockReportResourceTransfers.find((item) => item.id === Number(params.id));
    if (!transfer) return reportError(404, '转移申请不存在');
    if (transfer.status !== 'pending') return reportError(409, '转移申请已处理');
    const body = await request.json() as { decision: 'accepted' | 'rejected'; note?: string };
    transfer.status = body.decision;
    transfer.decidedBy = DEMO_USER_ID;
    transfer.decidedAt = mockDateTime();
    transfer.decisionNote = body.note ?? null;
    transfer.updatedAt = transfer.decidedAt;
    if (body.decision === 'accepted') {
      const resource = findResource(transfer.resourceType, transfer.resourceId);
      if (resource) {
        resource.ownerId = transfer.toOwnerId;
        resource.ownerName = transfer.toOwnerName;
        resource.updatedAt = transfer.decidedAt;
      }
    }
    return reportOk(transfer, '转移申请已处理');
  }),

  http.post('/api/report/governance/transfers/:id/cancel', async ({ params, request }) => {
    const transfer = mockReportResourceTransfers.find((item) => item.id === Number(params.id));
    if (!transfer) return reportError(404, '转移申请不存在');
    if (transfer.status !== 'pending' || transfer.requestedBy !== DEMO_USER_ID) return reportError(403, '不能取消该转移申请');
    const body = await request.json() as { reason?: string };
    transfer.status = 'cancelled';
    transfer.decisionNote = body.reason ?? null;
    transfer.updatedAt = mockDateTime();
    return reportOk(transfer, '已取消');
  }),

  http.get('/api/report/environments', () => reportOk(mockReportEnvironments)),

  http.post('/api/report/environments', async ({ request }) => {
    const body = await request.json() as Omit<ReportEnvironment, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
    if (mockReportEnvironments.some((item) => item.code === body.code)) return reportError(409, '环境编码已存在');
    if (body.isDefault) mockReportEnvironments.forEach((item) => { item.isDefault = false; });
    const now = mockDateTime();
    const environment: ReportEnvironment = {
      ...body,
      id: nextReportP2Id('environment', mockReportEnvironments),
      tenantId: DEMO_TENANT_ID,
      config: body.config ?? {},
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportEnvironments.push(environment);
    return reportOk(environment, '创建成功');
  }),

  http.put('/api/report/environments/:id', async ({ params, request }) => {
    const environment = mockReportEnvironments.find((item) => item.id === Number(params.id));
    if (!environment) return reportError(404, '环境不存在');
    const body = await request.json() as Partial<ReportEnvironment>;
    if (body.isDefault) mockReportEnvironments.forEach((item) => { item.isDefault = item.id === environment.id; });
    Object.assign(environment, body, { updatedBy: DEMO_USER_ID, updatedAt: mockDateTime() });
    return reportOk(environment, '更新成功');
  }),

  http.delete('/api/report/environments/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportEnvironments.findIndex((item) => item.id === id);
    if (index < 0) return reportError(404, '环境不存在');
    if (mockReportEnvironments[index].isDefault) return reportError(409, '默认环境不能删除');
    mockReportEnvironments.splice(index, 1);
    return reportOk(null, '删除成功');
  }),

  http.get('/api/report/environments/promotions', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportPromotions.filter((item) =>
      (!url.searchParams.get('resourceType') || item.resourceType === url.searchParams.get('resourceType'))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')));
    return reportOk(reportPage(request, list));
  }),

  http.post('/api/report/environments/promotions', async ({ request }) => {
    const body = await request.json() as Pick<ReportEnvironmentPromotion, 'resourceType' | 'resourceId' | 'sourceEnvironmentId' | 'targetEnvironmentId' | 'sourceRevision' | 'sourceSnapshot'>;
    const resource = findResource(body.resourceType, body.resourceId);
    const source = mockReportEnvironments.find((item) => item.id === body.sourceEnvironmentId);
    const target = mockReportEnvironments.find((item) => item.id === body.targetEnvironmentId);
    if (!resource || !source || !target) return reportError(404, '资源或环境不存在');
    if (source.id === target.id) return reportError(400, '来源环境和目标环境不能相同');
    const now = mockDateTime();
    const promotion: ReportEnvironmentPromotion = {
      ...body,
      id: nextReportP2Id('promotion', mockReportPromotions),
      tenantId: DEMO_TENANT_ID,
      resourceName: resource.name,
      sourceEnvironmentName: source.name,
      targetEnvironmentName: target.name,
      targetSnapshot: null,
      rollbackSnapshot: null,
      status: 'pending',
      requestedBy: DEMO_USER_ID,
      approvedBy: null,
      deployedBy: null,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      createdBy: DEMO_USER_ID,
      updatedBy: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    mockReportPromotions.unshift(promotion);
    return reportOk(promotion, '发布申请已创建');
  }),

  http.post('/api/report/environments/promotions/:id/transition', async ({ params, request }) => {
    const promotion = mockReportPromotions.find((item) => item.id === Number(params.id));
    if (!promotion) return reportError(404, '发布记录不存在');
    const body = await request.json() as { action: 'approve' | 'deploy' | 'cancel' | 'rollback'; expectedStatus: ReportEnvironmentPromotion['status']; note?: string };
    if (promotion.status !== body.expectedStatus) return reportError(409, '发布状态已变化');
    const now = mockDateTime();
    if (body.action === 'approve' && promotion.status === 'pending') {
      promotion.status = 'approved';
      promotion.approvedBy = DEMO_USER_ID;
    } else if (body.action === 'deploy' && promotion.status === 'approved') {
      promotion.status = 'succeeded';
      promotion.deployedBy = DEMO_USER_ID;
      promotion.startedAt = now;
      promotion.completedAt = now;
      promotion.targetSnapshot = promotion.sourceSnapshot;
    } else if (body.action === 'rollback' && promotion.status === 'succeeded') {
      promotion.status = 'rolled_back';
      promotion.rollbackSnapshot = promotion.targetSnapshot;
      promotion.completedAt = now;
    } else if (body.action === 'cancel' && ['pending', 'approved'].includes(promotion.status)) {
      promotion.status = 'cancelled';
      promotion.completedAt = now;
    } else {
      return reportError(409, '当前状态不允许该操作');
    }
    promotion.updatedAt = now;
    return reportOk(promotion, '操作成功');
  }),
];
