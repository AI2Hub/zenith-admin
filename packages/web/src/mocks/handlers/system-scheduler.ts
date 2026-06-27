import { http, HttpResponse } from 'msw';
import type { SystemSchedulerRun, SystemSchedulerTask } from '@zenith/shared';
import { mockDateTime, mockDateTimeOffset } from '@/mocks/utils/date';

const tasks: SystemSchedulerTask[] = [
  {
    name: 'export-file-cleanup',
    title: '导出文件自动清理',
    module: '导出中心',
    description: '每天清理已过期的导出文件，并把任务状态标记为 expired。',
    taskType: 'recurring',
    cronExpression: '0 3 * * *',
    registeredAt: mockDateTimeOffset(-6 * 3600 * 1000),
    allowManualRun: true,
    nextRunAt: '2026-06-28 03:00:00',
    running: false,
    lastRunAt: mockDateTimeOffset(-2 * 3600 * 1000),
    lastRunStatus: 'success',
    lastRunMessage: '清理了 2 个过期导出文件',
    lastDurationMs: 842,
    totalRuns: 12,
    successCount: 12,
    failedCount: 0,
  },
  {
    name: 'workflow-delay-recovery',
    title: '工作流延时任务恢复',
    module: '工作流',
    description: '兜底扫描已到期的 delay 节点任务并恢复执行。',
    taskType: 'recurring',
    cronExpression: '* * * * *',
    registeredAt: mockDateTimeOffset(-6 * 3600 * 1000),
    allowManualRun: true,
    nextRunAt: mockDateTimeOffset(60 * 1000),
    running: false,
    lastRunAt: mockDateTimeOffset(-60 * 1000),
    lastRunStatus: 'success',
    lastRunMessage: '{"scanned":0,"resumed":0,"skipped":0,"failed":0}',
    lastDurationMs: 38,
    totalRuns: 240,
    successCount: 240,
    failedCount: 0,
  },
  {
    name: 'export-jobs',
    title: '导出任务执行 Worker',
    module: '导出中心',
    description: '消费异步导出任务队列，生成 Excel/CSV 文件并更新导出中心任务状态。',
    taskType: 'queue',
    cronExpression: null,
    registeredAt: mockDateTimeOffset(-6 * 3600 * 1000),
    allowManualRun: false,
    nextRunAt: null,
    running: false,
    lastRunAt: mockDateTimeOffset(-30 * 60 * 1000),
    lastRunStatus: 'success',
    lastRunMessage: '导出任务 18 执行完成',
    lastDurationMs: 2350,
    totalRuns: 18,
    successCount: 17,
    failedCount: 1,
  },
  {
    name: 'workflow-delay-wakeup',
    title: '工作流延时唤醒 Worker',
    module: '工作流',
    description: '消费 delay 节点唤醒队列，到期后恢复等待中的工作流任务。',
    taskType: 'queue',
    cronExpression: null,
    registeredAt: mockDateTimeOffset(-6 * 3600 * 1000),
    allowManualRun: false,
    nextRunAt: null,
    running: false,
    lastRunAt: mockDateTimeOffset(-10 * 60 * 1000),
    lastRunStatus: 'success',
    lastRunMessage: '任务 1024 已恢复执行',
    lastDurationMs: 91,
    totalRuns: 26,
    successCount: 26,
    failedCount: 0,
  },
];

let nextRunId = 5;

const runs: SystemSchedulerRun[] = [
  {
    id: 1,
    taskName: 'export-file-cleanup',
    taskTitle: '导出文件自动清理',
    taskType: 'recurring',
    module: '导出中心',
    triggerType: 'schedule',
    status: 'success',
    startedAt: mockDateTimeOffset(-2 * 3600 * 1000),
    endedAt: mockDateTimeOffset(-2 * 3600 * 1000 + 842),
    durationMs: 842,
    resultMessage: '清理了 2 个过期导出文件',
    errorMessage: null,
    createdAt: mockDateTimeOffset(-2 * 3600 * 1000),
  },
  {
    id: 2,
    taskName: 'workflow-delay-recovery',
    taskTitle: '工作流延时任务恢复',
    taskType: 'recurring',
    module: '工作流',
    triggerType: 'schedule',
    status: 'success',
    startedAt: mockDateTimeOffset(-60 * 1000),
    endedAt: mockDateTimeOffset(-60 * 1000 + 38),
    durationMs: 38,
    resultMessage: '{"scanned":0,"resumed":0,"skipped":0,"failed":0}',
    errorMessage: null,
    createdAt: mockDateTimeOffset(-60 * 1000),
  },
  {
    id: 3,
    taskName: 'export-jobs',
    taskTitle: '导出任务执行 Worker',
    taskType: 'queue',
    module: '导出中心',
    triggerType: 'queue',
    status: 'success',
    startedAt: mockDateTimeOffset(-30 * 60 * 1000),
    endedAt: mockDateTimeOffset(-30 * 60 * 1000 + 2350),
    durationMs: 2350,
    resultMessage: '导出任务 18 执行完成',
    errorMessage: null,
    createdAt: mockDateTimeOffset(-30 * 60 * 1000),
  },
  {
    id: 4,
    taskName: 'workflow-delay-wakeup',
    taskTitle: '工作流延时唤醒 Worker',
    taskType: 'queue',
    module: '工作流',
    triggerType: 'queue',
    status: 'success',
    startedAt: mockDateTimeOffset(-10 * 60 * 1000),
    endedAt: mockDateTimeOffset(-10 * 60 * 1000 + 91),
    durationMs: 91,
    resultMessage: '任务 1024 已恢复执行',
    errorMessage: null,
    createdAt: mockDateTimeOffset(-10 * 60 * 1000),
  },
];

export const systemSchedulerHandlers = [
  http.get('/api/system-scheduler/tasks', () => {
    return HttpResponse.json({ code: 0, message: 'ok', data: tasks });
  }),

  http.get('/api/system-scheduler/runs', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    const taskName = url.searchParams.get('taskName') ?? '';
    const taskType = url.searchParams.get('taskType') ?? '';
    const triggerType = url.searchParams.get('triggerType') ?? '';
    const status = url.searchParams.get('status') ?? '';

    const filtered = runs
      .filter((item) => !taskName || item.taskName === taskName)
      .filter((item) => !taskType || item.taskType === taskType)
      .filter((item) => !triggerType || item.triggerType === triggerType)
      .filter((item) => !status || item.status === status)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total: filtered.length, page, pageSize } });
  }),

  http.post('/api/system-scheduler/tasks/:name/run', ({ params }) => {
    const name = String(params.name);
    const task = tasks.find((item) => item.name === name);
    if (!task) return HttpResponse.json({ code: 404, message: '系统周期任务不存在或尚未注册', data: null });
    if (!task.allowManualRun) return HttpResponse.json({ code: 400, message: '该系统周期任务不允许手动执行', data: null });

    const startedAt = mockDateTime();
    const endedAt = mockDateTime(Date.now() + 120);
    const message = '手动执行完成';
    runs.unshift({
      id: nextRunId++,
      taskName: task.name,
      taskTitle: task.title,
      taskType: task.taskType,
      module: task.module,
      triggerType: 'manual',
      status: 'success',
      startedAt,
      endedAt,
      durationMs: 120,
      resultMessage: message,
      errorMessage: null,
      createdAt: startedAt,
    });
    task.lastRunAt = startedAt;
    task.lastRunStatus = 'success';
    task.lastRunMessage = message;
    task.lastDurationMs = 120;
    task.totalRuns += 1;
    task.successCount += 1;
    return HttpResponse.json({ code: 0, message: '执行完成', data: { message } });
  }),
];
