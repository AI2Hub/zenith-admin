import { http, HttpResponse } from 'msw';
import type {
  WorkflowTriggerExecution,
  WorkflowTriggerExecutionStatus,
} from '@zenith/shared';
import { mockDateTime, mockDateTimeOffset } from '@/mocks/utils/date';

function ok<T>(data: T, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}

function err(message: string, code = 400) {
  return HttpResponse.json({ code, message });
}

const mockTriggerExecutions: WorkflowTriggerExecution[] = [
  {
    id: 1,
    instanceId: 1,
    taskId: 1,
    nodeKey: 'approve_1',
    nodeName: '直属主管审批',
    triggerType: 'webhook',
    status: 'success',
    attempt: 1,
    requestUrl: 'https://example.com/workflow/webhook',
    requestMethod: 'POST',
    requestBody: '{"instanceId":1,"nodeKey":"approve_1"}',
    responseStatus: 200,
    responseBody: '{"ok":true}',
    errorMessage: null,
    durationMs: 142,
    tenantId: 1,
    createdAt: mockDateTimeOffset(-2 * 60 * 60 * 1000),
  },
  {
    id: 2,
    instanceId: 2,
    taskId: 3,
    nodeKey: 'approve_2',
    nodeName: '财务审批',
    triggerType: 'callback',
    status: 'failed',
    attempt: 2,
    requestUrl: 'https://api.example.com/workflow/callback',
    requestMethod: 'POST',
    requestBody: '{"instanceId":2,"taskId":3}',
    responseStatus: 504,
    responseBody: '{"message":"timeout"}',
    errorMessage: '回调请求超时',
    durationMs: 30000,
    tenantId: 1,
    createdAt: mockDateTimeOffset(-30 * 60 * 1000),
  },
  {
    id: 3,
    instanceId: 2,
    taskId: null,
    nodeKey: 'update_form_data',
    nodeName: '字段回写',
    triggerType: 'updateData',
    status: 'retrying',
    attempt: 3,
    requestUrl: null,
    requestMethod: null,
    requestBody: '{"status":"approved"}',
    responseStatus: null,
    responseBody: null,
    errorMessage: '等待下一次重试',
    durationMs: null,
    tenantId: 1,
    createdAt: mockDateTime(),
  },
];

function paginate<T>(list: T[], page: number, pageSize: number) {
  return list.slice((page - 1) * pageSize, page * pageSize);
}

export const workflowTriggerExecutionsHandlers = [
  http.get('/api/workflows/trigger-executions', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    const instanceId = url.searchParams.get('instanceId');
    const nodeKey = (url.searchParams.get('nodeKey') ?? '').trim();
    const status = url.searchParams.get('status') as WorkflowTriggerExecutionStatus | null;

    let list = [...mockTriggerExecutions];
    if (instanceId) list = list.filter((item) => item.instanceId === Number(instanceId));
    if (nodeKey) list = list.filter((item) => item.nodeKey.includes(nodeKey));
    if (status) list = list.filter((item) => item.status === status);
    list.sort((a, b) => b.id - a.id);

    return ok({ list: paginate(list, page, pageSize), total: list.length, page, pageSize });
  }),

  http.get('/api/workflows/trigger-executions/:id', ({ params }) => {
    const row = mockTriggerExecutions.find((item) => item.id === Number(params.id));
    if (!row) return err('触发器执行记录不存在', 404);
    return ok(row);
  }),
];
