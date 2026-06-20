import { http, HttpResponse } from 'msw';
import type {
  WorkflowComment, WorkflowQuickPhrase, WorkflowDelegation, WorkflowAnalytics,
  WorkflowInstanceStatus, WorkflowOverdueTask, WorkflowTemplate, WorkflowTaskConsult,
} from '@zenith/shared';
import { mockWorkflowInstances, mockWorkflowTasks, getNextInstanceId, getNextDefinitionId } from '@/mocks/data/workflow';
import { mockWorkflowDefinitions } from '@/mocks/data/workflow';
import { mockDateTime } from '@/mocks/utils/date';

function ok<T>(data: T, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}
function err(message: string, code = 400) {
  return HttpResponse.json({ code, message });
}

// ── 内存态数据 ──
const mockComments: WorkflowComment[] = [];
let nextCommentId = 1;

const mockQuickPhrases: WorkflowQuickPhrase[] = [
  { id: 1, userId: null, content: '同意，请继续推进。', sort: 0, createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 2, userId: null, content: '情况属实，予以通过。', sort: 1, createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 3, userId: null, content: '材料不齐，请补充后再提交。', sort: 2, createdAt: mockDateTime(), updatedAt: mockDateTime() },
];
let nextPhraseId = 100;

const mockDelegations: WorkflowDelegation[] = [];
let nextDelegationId = 1;

const mockTemplates: WorkflowTemplate[] = [
  {
    id: 1, name: '请假申请（示例模板）', code: 'tpl_leave', description: '员工请假，直属主管审批',
    categoryName: '人事', icon: 'CalendarDays', color: '#3370ff',
    flowData: (mockWorkflowDefinitions[0]?.flowData ?? null), formSchema: null,
    sort: 0, builtin: true, createdAt: mockDateTime(), updatedAt: mockDateTime(),
  },
  {
    id: 2, name: '费用报销（示例模板）', code: 'tpl_expense', description: '报销单，按金额分级审批',
    categoryName: '财务', icon: 'Receipt', color: '#0dc87c',
    flowData: (mockWorkflowDefinitions[0]?.flowData ?? null), formSchema: null,
    sort: 1, builtin: true, createdAt: mockDateTime(), updatedAt: mockDateTime(),
  },
];
let nextTemplateId = 100;

const mockConsults: WorkflowTaskConsult[] = [];
let nextConsultId = 1;

function buildAnalytics(): WorkflowAnalytics {
  const insts = mockWorkflowInstances;
  const statusMap = new Map<string, number>();
  for (const i of insts) statusMap.set(i.status, (statusMap.get(i.status) ?? 0) + 1);
  const statusCounts = [...statusMap.entries()].map(([status, count]) => ({ status: status as WorkflowInstanceStatus, count }));
  const pending = mockWorkflowTasks.filter((t) => t.status === 'pending');

  // 各流程定义统计
  const defMap = new Map<number, { name: string; total: number; running: number; approved: number; rejected: number }>();
  for (const i of insts) {
    const e = defMap.get(i.definitionId) ?? { name: i.definitionName ?? `流程#${i.definitionId}`, total: 0, running: 0, approved: 0, rejected: 0 };
    e.total += 1;
    if (i.status === 'running') e.running += 1;
    if (i.status === 'approved') e.approved += 1;
    if (i.status === 'rejected') e.rejected += 1;
    defMap.set(i.definitionId, e);
  }
  const definitionStats = [...defMap.entries()].map(([definitionId, e]) => ({
    definitionId, definitionName: e.name, total: e.total, running: e.running, approved: e.approved, rejected: e.rejected,
    avgDurationSec: 3600 * 6,
  }));

  // 节点瓶颈
  const nodeMap = new Map<string, { nodeName: string; pending: number; done: number }>();
  for (const t of mockWorkflowTasks) {
    const e = nodeMap.get(t.nodeKey) ?? { nodeName: t.nodeName, pending: 0, done: 0 };
    if (t.status === 'pending') e.pending += 1;
    if (t.status === 'approved' || t.status === 'rejected') e.done += 1;
    nodeMap.set(t.nodeKey, e);
  }
  const nodeBottlenecks = [...nodeMap.entries()].slice(0, 10).map(([nodeKey, e]) => ({
    definitionId: 0, definitionName: '—', nodeKey, nodeName: e.nodeName,
    avgHandleSec: 3600 * 2, pendingCount: e.pending, doneCount: e.done,
  }));

  // 审批人工作量
  const approverMap = new Map<number, { name: string; count: number }>();
  for (const t of pending) {
    if (t.assigneeId == null) continue;
    const e = approverMap.get(t.assigneeId) ?? { name: t.assigneeName ?? `用户#${t.assigneeId}`, count: 0 };
    e.count += 1;
    approverMap.set(t.assigneeId, e);
  }
  const approverWorkloads = [...approverMap.entries()].map(([userId, e]) => ({
    userId, userName: e.name, pendingCount: e.count, oldestPendingSec: 3600 * 12,
  }));

  // 近 14 天趋势
  const trend = Array.from({ length: 14 }, (_, idx) => {
    const date = new Date(Date.now() - (13 - idx) * 86400000).toISOString().slice(0, 10);
    return { date, created: Math.floor(Math.random() * 4), completed: Math.floor(Math.random() * 3) };
  });

  return {
    statusCounts,
    total: insts.length,
    avgDurationSec: 3600 * 8,
    pendingTaskCount: pending.length,
    overdueTaskCount: Math.min(pending.length, 2),
    dueSoonTaskCount: pending.length > 2 ? 1 : 0,
    recentCreated: insts.length,
    definitionStats,
    nodeBottlenecks,
    approverWorkloads,
    trend,
  };
}

function buildOverdueList(): WorkflowOverdueTask[] {
  return mockWorkflowTasks
    .filter((t) => t.status === 'pending')
    .slice(0, 2)
    .map((t, idx) => {
      const inst = mockWorkflowInstances.find((i) => i.id === t.instanceId);
      return {
        taskId: t.id,
        instanceId: t.instanceId,
        instanceTitle: inst?.title ?? `实例#${t.instanceId}`,
        serialNo: inst?.serialNo ?? null,
        definitionName: inst?.definitionName ?? '—',
        nodeName: t.nodeName,
        assigneeId: t.assigneeId ?? null,
        assigneeName: t.assigneeName ?? null,
        timeoutAt: mockDateTime(),
        overdueSec: (idx + 1) * 3600 * 26,
      };
    });
}

export const workflowExtraHandlers = [
  // ── 数据分析（必须在 /instances/:id 之前注册）──
  http.get('/api/workflows/instances/analytics', () => ok(buildAnalytics())),

  // ── 我的协办（必须在 /instances/:id 之前注册）──
  http.get('/api/workflows/instances/consults/mine', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const all = mockConsults.filter((c) => c.consulteeId === 1);
    return ok({ list: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  }),
  http.post('/api/workflows/instances/consults/:id/reply', async ({ params, request }) => {
    const body = await request.json() as { opinion: string };
    const c = mockConsults.find((x) => x.id === Number(params.id));
    if (!c) return err('协办记录不存在', 404);
    c.opinion = body.opinion; c.status = 'replied'; c.repliedAt = mockDateTime();
    return ok(c, '已回复');
  }),

  // ── 流程模板 ──
  http.get('/api/workflows/templates', () => ok(mockTemplates)),
  http.post('/api/workflows/templates/save-as', async ({ request }) => {
    const body = await request.json() as { name: string; description?: string; icon?: string; color?: string };
    const now = mockDateTime();
    const tpl: WorkflowTemplate = { id: nextTemplateId++, name: body.name, code: null, description: body.description ?? null, categoryName: null, icon: body.icon ?? null, color: body.color ?? null, flowData: mockWorkflowDefinitions[0]?.flowData ?? null, formSchema: null, sort: 0, builtin: false, createdAt: now, updatedAt: now };
    mockTemplates.push(tpl);
    return ok(tpl, '已保存为模板');
  }),
  http.post('/api/workflows/templates/:id/clone', async ({ params, request }) => {
    const tpl = mockTemplates.find((t) => t.id === Number(params.id));
    if (!tpl) return err('模板不存在', 404);
    let name = tpl.name;
    try { const b = await request.json() as { name?: string }; if (b?.name) name = b.name; } catch { /* no body */ }
    const now = mockDateTime();
    const def = { ...(mockWorkflowDefinitions[0] ?? {}), id: getNextDefinitionId(), name, status: 'draft' as const, version: 1, flowData: tpl.flowData, createdAt: now, updatedAt: now };
    mockWorkflowDefinitions.push(def as typeof mockWorkflowDefinitions[number]);
    return ok(def, '已创建');
  }),
  http.delete('/api/workflows/templates/:id', ({ params }) => {
    const idx = mockTemplates.findIndex((t) => t.id === Number(params.id));
    if (idx === -1) return err('模板不存在', 404);
    if (mockTemplates[idx].builtin) return err('系统内置模板不可删除');
    mockTemplates.splice(idx, 1);
    return ok(null, '已删除');
  }),

  // ── 协办 / 撤回 ──
  http.post('/api/workflows/tasks/:taskId/consult', async ({ params, request }) => {
    const body = await request.json() as { consulteeIds: number[]; question?: string };
    const task = mockWorkflowTasks.find((t) => t.id === Number(params.taskId));
    const created = (body.consulteeIds ?? []).map((cid) => {
      const c: WorkflowTaskConsult = { id: nextConsultId++, taskId: Number(params.taskId), instanceId: task?.instanceId ?? 0, nodeName: task?.nodeName ?? null, inviterId: 1, inviterName: '张三', consulteeId: cid, consulteeName: `用户#${cid}`, question: body.question ?? null, opinion: null, status: 'pending', repliedAt: null, createdAt: mockDateTime() };
      mockConsults.push(c);
      return c;
    });
    return ok(created, '已发起协办');
  }),
  http.post('/api/workflows/tasks/:taskId/recall', ({ params }) => {
    const task = mockWorkflowTasks.find((t) => t.id === Number(params.taskId));
    if (!task) return err('任务不存在', 404);
    task.status = 'pending'; task.comment = null; task.signature = null; task.actionAt = null;
    const inst = mockWorkflowInstances.find((i) => i.id === task.instanceId);
    if (inst) { inst.status = 'running'; inst.updatedAt = mockDateTime(); return ok(inst, '已撤回'); }
    return err('流程数据异常', 500);
  }),

  // ── 超时待办预警 ──
  http.get('/api/workflows/instances/overdue', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const all = buildOverdueList();
    return ok({ list: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  }),

  // ── 导出（Demo 下返回占位 CSV）──
  http.get('/api/workflows/instances/export', () => {
    const header = '业务编号,申请标题,流程,发起人,状态\n';
    const body = mockWorkflowInstances.map((i) => `${i.serialNo ?? ''},${i.title},${i.definitionName ?? ''},${i.initiatorName ?? ''},${i.status}`).join('\n');
    return new HttpResponse(`\uFEFF${header}${body}`, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="workflow-instances.csv"',
      },
    });
  }),

  // ── 流程评论 ──
  http.get('/api/workflows/instances/:id/comments', ({ params }) => {
    const list = mockComments.filter((c) => c.instanceId === Number(params.id));
    return ok(list);
  }),
  http.post('/api/workflows/instances/:id/comments', async ({ params, request }) => {
    const body = await request.json() as { content: string; mentions?: number[]; taskId?: number | null };
    const comment: WorkflowComment = {
      id: nextCommentId++,
      instanceId: Number(params.id),
      taskId: body.taskId ?? null,
      userId: 1,
      userName: '张三',
      userAvatar: null,
      content: body.content,
      mentions: body.mentions ?? [],
      mentionNames: (body.mentions ?? []).map((m) => `用户#${m}`),
      attachments: [],
      createdAt: mockDateTime(),
    };
    mockComments.push(comment);
    return ok(comment, '已评论');
  }),

  // ── 草稿：编辑 / 提交 / 重新提交 ──
  http.put('/api/workflows/instances/:id/draft', async ({ params, request }) => {
    const body = await request.json() as { title?: string; formData?: Record<string, unknown> };
    const inst = mockWorkflowInstances.find((i) => i.id === Number(params.id));
    if (!inst) return err('流程实例不存在', 404);
    if (inst.status !== 'draft') return err('仅草稿可编辑');
    if (body.title !== undefined) inst.title = body.title;
    if (body.formData !== undefined) inst.formData = body.formData;
    inst.updatedAt = mockDateTime();
    return ok(inst, '草稿已保存');
  }),
  http.post('/api/workflows/instances/:id/submit', ({ params }) => {
    const inst = mockWorkflowInstances.find((i) => i.id === Number(params.id));
    if (!inst) return err('流程实例不存在', 404);
    if (inst.status !== 'draft') return err('仅草稿可提交');
    inst.status = 'running';
    inst.updatedAt = mockDateTime();
    return ok(inst, '申请已提交');
  }),
  http.post('/api/workflows/instances/:id/resubmit', ({ params }) => {
    const src = mockWorkflowInstances.find((i) => i.id === Number(params.id));
    if (!src) return err('流程实例不存在', 404);
    const now = mockDateTime();
    const clone = {
      ...src,
      id: getNextInstanceId(),
      serialNo: null,
      status: 'draft' as const,
      currentNodeKey: null,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    mockWorkflowInstances.push(clone);
    return ok(clone, '已生成草稿');
  }),

  // ── 管理员强制操作 ──
  http.post('/api/workflows/instances/:id/jump', async ({ params, request }) => {
    const body = await request.json() as { targetNodeKey: string };
    const inst = mockWorkflowInstances.find((i) => i.id === Number(params.id));
    if (!inst) return err('流程实例不存在', 404);
    if (inst.status !== 'running') return err('仅审批中的流程可强制跳转');
    mockWorkflowTasks.filter((t) => t.instanceId === inst.id && (t.status === 'pending' || t.status === 'waiting'))
      .forEach((t) => { t.status = 'skipped'; t.actionAt = mockDateTime(); });
    inst.currentNodeKey = body.targetNodeKey;
    inst.updatedAt = mockDateTime();
    return ok(inst, '已跳转');
  }),
  http.post('/api/workflows/tasks/:taskId/reassign', async ({ params, request }) => {
    const body = await request.json() as { targetUserId: number };
    const task = mockWorkflowTasks.find((t) => t.id === Number(params.taskId));
    if (!task) return err('任务不存在', 404);
    task.assigneeId = body.targetUserId;
    task.assigneeName = `用户#${body.targetUserId}`;
    return ok(task, '已改派');
  }),

  // ── 批量审批 ──
  http.post('/api/workflows/tasks/batch-approve', async ({ request }) => {
    const { taskIds, comment } = await request.json() as { taskIds: number[]; comment?: string };
    const results = taskIds.map((taskId) => {
      const task = mockWorkflowTasks.find((t) => t.id === taskId);
      if (task && task.status === 'pending') {
        task.status = 'approved'; task.comment = comment ?? null; task.actionAt = mockDateTime();
        return { taskId, success: true };
      }
      return { taskId, success: false, message: '任务不存在或已处理' };
    });
    const succeeded = results.filter((r) => r.success).length;
    return ok({ succeeded, failed: results.length - succeeded, results }, `成功 ${succeeded} 条`);
  }),
  http.post('/api/workflows/tasks/batch-reject', async ({ request }) => {
    const { taskIds, comment } = await request.json() as { taskIds: number[]; comment: string };
    const results = taskIds.map((taskId) => {
      const task = mockWorkflowTasks.find((t) => t.id === taskId);
      if (task && task.status === 'pending') {
        task.status = 'rejected'; task.comment = comment; task.actionAt = mockDateTime();
        const inst = mockWorkflowInstances.find((i) => i.id === task.instanceId);
        if (inst) { inst.status = 'rejected'; inst.updatedAt = mockDateTime(); }
        return { taskId, success: true };
      }
      return { taskId, success: false, message: '任务不存在或已处理' };
    });
    const succeeded = results.filter((r) => r.success).length;
    return ok({ succeeded, failed: results.length - succeeded, results }, `成功 ${succeeded} 条`);
  }),

  // ── 审批意见常用语 ──
  http.get('/api/workflows/quick-phrases', () => ok(mockQuickPhrases)),
  http.post('/api/workflows/quick-phrases', async ({ request }) => {
    const body = await request.json() as { content: string; sort?: number };
    const phrase: WorkflowQuickPhrase = { id: nextPhraseId++, userId: 1, content: body.content, sort: body.sort ?? 0, createdAt: mockDateTime(), updatedAt: mockDateTime() };
    mockQuickPhrases.push(phrase);
    return ok(phrase, '已新增');
  }),
  http.put('/api/workflows/quick-phrases/:id', async ({ params, request }) => {
    const body = await request.json() as { content?: string; sort?: number };
    const p = mockQuickPhrases.find((x) => x.id === Number(params.id));
    if (!p) return err('常用语不存在', 404);
    if (body.content !== undefined) p.content = body.content;
    if (body.sort !== undefined) p.sort = body.sort;
    p.updatedAt = mockDateTime();
    return ok(p, '已更新');
  }),
  http.delete('/api/workflows/quick-phrases/:id', ({ params }) => {
    const idx = mockQuickPhrases.findIndex((x) => x.id === Number(params.id));
    if (idx === -1) return err('常用语不存在', 404);
    mockQuickPhrases.splice(idx, 1);
    return ok(null, '已删除');
  }),

  // ── 审批代理 / 离岗委托 ──
  http.get('/api/workflows/delegations', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const list = mockDelegations.slice((page - 1) * pageSize, page * pageSize);
    return ok({ list, total: mockDelegations.length, page, pageSize });
  }),
  http.post('/api/workflows/delegations', async ({ request }) => {
    const body = await request.json() as Partial<WorkflowDelegation> & { delegateId: number };
    const now = mockDateTime();
    const row: WorkflowDelegation = {
      id: nextDelegationId++,
      principalId: body.principalId ?? 1,
      principalName: '张三',
      delegateId: body.delegateId,
      delegateName: `用户#${body.delegateId}`,
      definitionId: body.definitionId ?? null,
      definitionName: body.definitionId ? `流程#${body.definitionId}` : null,
      reason: body.reason ?? null,
      startAt: body.startAt ?? null,
      endAt: body.endAt ?? null,
      enabled: body.enabled ?? true,
      active: body.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    mockDelegations.push(row);
    return ok(row, '已新增');
  }),
  http.put('/api/workflows/delegations/:id', async ({ params, request }) => {
    const body = await request.json() as Partial<WorkflowDelegation>;
    const row = mockDelegations.find((x) => x.id === Number(params.id));
    if (!row) return err('委托规则不存在', 404);
    Object.assign(row, body, { updatedAt: mockDateTime() });
    if (body.enabled !== undefined) row.active = body.enabled;
    return ok(row, '已更新');
  }),
  http.delete('/api/workflows/delegations/:id', ({ params }) => {
    const idx = mockDelegations.findIndex((x) => x.id === Number(params.id));
    if (idx === -1) return err('委托规则不存在', 404);
    mockDelegations.splice(idx, 1);
    return ok(null, '已删除');
  }),
];
