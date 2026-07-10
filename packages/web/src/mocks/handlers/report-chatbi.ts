import { http } from 'msw';
import type {
  ReportChatbiMessage,
  ReportChatbiSession,
  ReportChatbiSessionDetail,
} from '@zenith/shared';
import {
  getNextReportDashboardId,
  getNextReportDatasetId,
  mockReportDashboards,
  mockReportDatasets,
  mockReportDatasources,
} from '@/mocks/data/report';
import {
  mockReportChatbiMessages,
  mockReportChatbiSessions,
  nextReportP2Id,
} from '@/mocks/data/report-p2';
import { mockDateTime } from '@/mocks/utils/date';
import {
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  matchesNumberParam,
  reportError,
  reportOk,
  reportPage,
} from './report-mock-utils';

const SAFE_TABLES = ['menus', 'departments', 'users'] as const;

async function parseObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function ownedSession(id: number): ReportChatbiSession | undefined {
  return mockReportChatbiSessions.find((item) => item.id === id && item.userId === DEMO_USER_ID);
}

function sessionDetail(session: ReportChatbiSession): ReportChatbiSessionDetail {
  return {
    session,
    messages: mockReportChatbiMessages.filter((message) => message.sessionId === session.id)
      .sort((a, b) => a.id - b.id),
  };
}

function addMessage(message: Omit<ReportChatbiMessage, 'id' | 'tenantId' | 'createdAt'>): ReportChatbiMessage {
  const created: ReportChatbiMessage = {
    ...message,
    id: nextReportP2Id('chatbi-message', mockReportChatbiMessages),
    tenantId: DEMO_TENANT_ID,
    createdAt: mockDateTime(),
  };
  mockReportChatbiMessages.push(created);
  return created;
}

export const reportChatbiHandlers = [
  http.get('/api/report/chatbi/sessions', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const list = mockReportChatbiSessions.filter((item) =>
      item.userId === DEMO_USER_ID
      && (!keyword || item.title.includes(keyword))
      && (!url.searchParams.get('status') || item.status === url.searchParams.get('status'))
      && matchesNumberParam(url, 'userId', item.userId));
    return reportOk(reportPage(request, list));
  }),

  http.post('/api/report/chatbi/sessions', async ({ request }) => {
    const body = await parseObject(request);
    if (!body || typeof body.title !== 'string' || !body.title.trim()) return reportError(400, '会话标题不能为空');
    const datasourceId = typeof body.datasourceId === 'number' ? body.datasourceId : null;
    const datasetId = typeof body.datasetId === 'number' ? body.datasetId : null;
    const dataset = datasetId ? mockReportDatasets.find((item) => item.id === datasetId) : null;
    const datasource = mockReportDatasources.find((item) => item.id === (dataset?.datasourceId ?? datasourceId));
    if (!datasource) return reportError(400, '必须选择有效的数据源或数据集上下文');
    const requestedTables = Array.isArray(body.allowedTables)
      ? body.allowedTables.filter((item): item is string => typeof item === 'string')
      : [];
    const allowedTables = requestedTables.length
      ? requestedTables.filter((table) => SAFE_TABLES.includes(table as typeof SAFE_TABLES[number]))
      : [...SAFE_TABLES];
    if (requestedTables.length && allowedTables.length !== requestedTables.length) return reportError(400, '包含不允许访问的数据表');
    const now = mockDateTime();
    const session: ReportChatbiSession = {
      id: nextReportP2Id('chatbi-session', mockReportChatbiSessions),
      tenantId: DEMO_TENANT_ID,
      userId: DEMO_USER_ID,
      title: body.title.trim(),
      datasourceId: datasource.id,
      datasetId: dataset?.id ?? null,
      allowedTables,
      contextSnapshot: {
        datasourceId: datasource.id,
        datasourceName: datasource.name,
        datasourceType: datasource.type,
        datasetId: dataset?.id ?? null,
        tables: allowedTables.map((name) => ({
          name,
          columns: name === 'departments'
            ? [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }]
            : [{ name: 'id', type: 'number' }, { name: 'status', type: 'string' }],
        })),
        frozenAt: now,
      },
      status: 'active',
      totalTokens: 0,
      totalCostUnits: 0,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockReportChatbiSessions.unshift(session);
    return reportOk(session, '创建成功');
  }),

  http.get('/api/report/chatbi/sessions/:id', ({ params }) => {
    const session = ownedSession(Number(params.id));
    return session ? reportOk(sessionDetail(session)) : reportError(404, 'ChatBI 会话不存在');
  }),

  http.put('/api/report/chatbi/sessions/:id', async ({ params, request }) => {
    const session = ownedSession(Number(params.id));
    if (!session) return reportError(404, 'ChatBI 会话不存在');
    const body = await parseObject(request);
    if (!body) return reportError(400, '请求体必须是 JSON 对象');
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) return reportError(400, '会话标题不能为空');
    if (typeof body.title === 'string') session.title = body.title.trim();
    if (body.status === 'active' || body.status === 'archived') session.status = body.status;
    session.updatedAt = mockDateTime();
    return reportOk(session, '更新成功');
  }),

  http.post('/api/report/chatbi/sessions/:id/archive', ({ params }) => {
    const session = ownedSession(Number(params.id));
    if (!session) return reportError(404, 'ChatBI 会话不存在');
    session.status = 'archived';
    session.updatedAt = mockDateTime();
    return reportOk(session, '归档成功');
  }),

  http.delete('/api/report/chatbi/sessions/:id', ({ params }) => {
    const id = Number(params.id);
    const index = mockReportChatbiSessions.findIndex((item) => item.id === id && item.userId === DEMO_USER_ID);
    if (index < 0) return reportError(404, 'ChatBI 会话不存在');
    mockReportChatbiSessions.splice(index, 1);
    for (let i = mockReportChatbiMessages.length - 1; i >= 0; i--) {
      if (mockReportChatbiMessages[i].sessionId === id) mockReportChatbiMessages.splice(i, 1);
    }
    return reportOk(null, '删除成功');
  }),

  http.post('/api/report/chatbi/sessions/:id/ask', async ({ params, request }) => {
    const session = ownedSession(Number(params.id));
    if (!session) return reportError(404, 'ChatBI 会话不存在');
    if (session.status !== 'active') return reportError(409, '已归档会话不能继续提问');
    const body = await parseObject(request);
    if (!body || typeof body.content !== 'string' || !body.content.trim()) return reportError(400, '请输入问题');
    const question = body.content.trim();
    if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke)\b/i.test(question)) {
      return reportError(400, 'ChatBI 仅支持只读分析问题');
    }
    const asksDepartment = question.includes('部门');
    const requestedTable = asksDepartment ? 'departments' : 'menus';
    if (!session.allowedTables.includes(requestedTable)) {
      return reportError(403, `当前会话未授权访问 ${requestedTable} 表`);
    }
    addMessage({
      sessionId: session.id,
      userId: DEMO_USER_ID,
      role: 'user',
      content: question,
      generatedSql: null,
      chartSuggestion: null,
      resultSample: [],
      resultRowCount: 0,
      resultByteSize: 0,
      savedResourceType: null,
      savedResourceId: null,
      savedDatasetId: null,
      savedDashboardId: null,
      promptTokens: 0,
      completionTokens: 0,
      costUnits: 0,
      latencyMs: null,
      modelId: null,
      errorMessage: null,
    });
    const generatedSql = asksDepartment
      ? 'SELECT name, COUNT(*) AS user_count FROM departments GROUP BY name ORDER BY user_count DESC LIMIT 100'
      : 'SELECT type, COUNT(*) AS item_count FROM menus GROUP BY type ORDER BY item_count DESC LIMIT 100';
    const resultSample = asksDepartment
      ? [{ name: '研发部', user_count: 28 }, { name: '产品部', user_count: 16 }]
      : [{ type: 'menu', item_count: 24 }, { type: 'button', item_count: 53 }];
    const assistant = addMessage({
      sessionId: session.id,
      userId: DEMO_USER_ID,
      role: 'assistant',
      content: asksDepartment ? '研发部人数最多，其次是产品部。' : '按钮类型数量最多，其次是菜单类型。',
      generatedSql,
      chartSuggestion: body.requestChart === false ? null : {
        type: 'bar',
        title: asksDepartment ? '部门用户数' : '菜单类型分布',
        categoryField: asksDepartment ? 'name' : 'type',
        valueFields: [asksDepartment ? 'user_count' : 'item_count'],
        options: {},
      },
      resultSample,
      resultRowCount: resultSample.length,
      resultByteSize: JSON.stringify(resultSample).length,
      savedResourceType: null,
      savedResourceId: null,
      savedDatasetId: null,
      savedDashboardId: null,
      promptTokens: 48,
      completionTokens: 72,
      costUnits: 0.12,
      latencyMs: 420,
      modelId: 'demo-readonly-model',
      errorMessage: null,
    });
    session.totalTokens += assistant.promptTokens + assistant.completionTokens;
    session.totalCostUnits += assistant.costUnits;
    session.lastMessageAt = assistant.createdAt;
    session.updatedAt = assistant.createdAt;
    return reportOk(assistant);
  }),

  http.post('/api/report/chatbi/messages/:id/save', async ({ params, request }) => {
    const message = mockReportChatbiMessages.find((item) => item.id === Number(params.id) && item.userId === DEMO_USER_ID);
    if (!message || message.role !== 'assistant' || !message.generatedSql) return reportError(404, '可保存的 ChatBI 回答不存在');
    const body = await parseObject(request);
    if (!body || (body.resourceType !== 'dataset' && body.resourceType !== 'dashboard')) return reportError(400, '资源类型不正确');
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `ChatBI 分析 ${message.id}`;
    const now = mockDateTime();
    if (body.resourceType === 'dataset') {
      const source = mockReportDatasets[0];
      const dataset = {
        ...source,
        id: getNextReportDatasetId(),
        name,
        content: { sql: message.generatedSql },
        fields: Object.keys(message.resultSample[0] ?? {}).map((field) => ({ name: field, label: field, type: 'string' as const })),
        folderId: typeof body.folderId === 'number' ? body.folderId : null,
        ownerId: DEMO_USER_ID,
        createdAt: now,
        updatedAt: now,
      };
      mockReportDatasets.push(dataset);
      message.savedResourceType = 'dataset';
      message.savedResourceId = dataset.id;
      message.savedDatasetId = dataset.id;
      return reportOk({ resourceType: 'dataset' as const, resourceId: dataset.id, name: dataset.name, datasetId: dataset.id }, '保存成功');
    }
    const targetDashboardId = typeof body.targetDashboardId === 'number' ? body.targetDashboardId : null;
    const target = targetDashboardId ? mockReportDashboards.find((item) => item.id === targetDashboardId) : null;
    if (targetDashboardId && !target) return reportError(404, '目标仪表盘不存在');
    if (target) {
      if (body.expectedDashboardRevision !== target.revision) return reportError(409, '仪表盘修订号不匹配');
      const widgetId = `chatbi_${message.id}`;
      target.widgets.push({
        i: widgetId,
        type: message.chartSuggestion?.type ?? 'table',
        title: message.chartSuggestion?.title ?? name,
        options: message.chartSuggestion?.options ?? {},
      });
      target.layout.push({ i: widgetId, x: 0, y: target.layout.length * 4, w: 6, h: 4 });
      target.revision += 1;
      target.updatedAt = now;
      message.savedResourceType = 'dashboard';
      message.savedResourceId = target.id;
      message.savedDashboardId = target.id;
      return reportOk({ resourceType: 'dashboard' as const, resourceId: target.id, name: target.name, datasetId: null }, '保存成功');
    }
    const source = mockReportDashboards[0];
    const dashboard = {
      ...source,
      id: getNextReportDashboardId(),
      name,
      folderId: typeof body.folderId === 'number' ? body.folderId : null,
      ownerId: DEMO_USER_ID,
      layout: [{ i: `chatbi_${message.id}`, x: 0, y: 0, w: 12, h: 6 }],
      canvasLayout: [],
      widgets: [{
        i: `chatbi_${message.id}`,
        type: message.chartSuggestion?.type ?? 'table',
        title: message.chartSuggestion?.title ?? name,
        options: message.chartSuggestion?.options ?? {},
      }],
      filters: [],
      lifecycleStatus: 'draft' as const,
      revision: 1,
      publishedSnapshot: null,
      publishedAt: null,
      publishedBy: null,
      publishedByName: null,
      createdAt: now,
      updatedAt: now,
    };
    mockReportDashboards.push(dashboard);
    message.savedResourceType = 'dashboard';
    message.savedResourceId = dashboard.id;
    message.savedDashboardId = dashboard.id;
    return reportOk({ resourceType: 'dashboard' as const, resourceId: dashboard.id, name: dashboard.name, datasetId: null }, '保存成功');
  }),

  http.get('/api/report/chatbi/quotas/me', () => {
    const messages = mockReportChatbiMessages.filter((item) => item.userId === DEMO_USER_ID && item.role === 'assistant');
    return reportOk({
      aiPromptTokensToday: messages.reduce((sum, item) => sum + item.promptTokens, 0),
      aiCompletionTokensToday: messages.reduce((sum, item) => sum + item.completionTokens, 0),
      aiRequestsToday: messages.length,
      queryCountToday: messages.filter((item) => item.generatedSql).length,
      queryRowsToday: messages.reduce((sum, item) => sum + item.resultRowCount, 0),
      queryBytesToday: messages.reduce((sum, item) => sum + item.resultByteSize, 0),
      queryCostUnitsToday: messages.reduce((sum, item) => sum + item.costUnits, 0),
    });
  }),

  http.get('/api/report/chatbi/audit', ({ request }) => {
    const url = new URL(request.url);
    const list = mockReportChatbiMessages.filter((item) =>
      item.role === 'assistant'
      && matchesNumberParam(url, 'userId', item.userId)
      && (!url.searchParams.has('failedOnly') || url.searchParams.get('failedOnly') !== 'true' || Boolean(item.errorMessage)));
    return reportOk(reportPage(request, list));
  }),
];
