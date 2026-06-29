import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { workflowJobs, workflowJobExecutions, workflowInstances, workflowDefinitions } from '../db/schema';
import type { WorkflowJobRow, WorkflowJobExecutionRow } from '../db/schema';
import { pageOffset } from '../lib/pagination';
import { formatDateTime, formatNullableDateTime } from '../lib/datetime';
import { retryJob, skipJob } from '../lib/workflow-jobs';

export interface ListWorkflowJobsQuery {
  page?: number;
  pageSize?: number;
  jobType?: WorkflowJobRow['jobType'];
  status?: WorkflowJobRow['status'];
  instanceId?: number;
  keyword?: string;
}

function mapJob(row: WorkflowJobRow, extra?: { instanceTitle?: string | null; definitionName?: string | null }) {
  return {
    id: row.id,
    jobType: row.jobType,
    status: row.status,
    instanceId: row.instanceId ?? null,
    instanceTitle: extra?.instanceTitle ?? null,
    definitionName: extra?.definitionName ?? null,
    taskId: row.taskId ?? null,
    nodeKey: row.nodeKey ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    traceId: row.traceId ?? null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAt: formatDateTime(row.runAt),
    lockedAt: formatNullableDateTime(row.lockedAt),
    lockedBy: row.lockedBy ?? null,
    lastError: row.lastError ?? null,
    result: (row.result ?? null) as Record<string, unknown> | null,
    tenantId: row.tenantId ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

function mapExecution(row: WorkflowJobExecutionRow) {
  return {
    id: row.id,
    jobId: row.jobId,
    jobType: row.jobType,
    attempt: row.attempt,
    status: row.status,
    requestUrl: row.requestUrl ?? null,
    requestMethod: row.requestMethod ?? null,
    requestBody: row.requestBody ?? null,
    responseStatus: row.responseStatus ?? null,
    responseBody: row.responseBody ?? null,
    errorMessage: row.errorMessage ?? null,
    durationMs: row.durationMs ?? null,
    startedAt: formatNullableDateTime(row.startedAt),
    finishedAt: formatNullableDateTime(row.finishedAt),
    createdAt: formatDateTime(row.createdAt),
  };
}

export async function listWorkflowJobs(query: ListWorkflowJobsQuery) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 10);
  const conds: SQL[] = [];
  if (query.jobType) conds.push(eq(workflowJobs.jobType, query.jobType));
  if (query.status) conds.push(eq(workflowJobs.status, query.status));
  if (query.instanceId != null) conds.push(eq(workflowJobs.instanceId, query.instanceId));
  if (query.keyword) {
    const kw = `%${query.keyword}%`;
    conds.push(or(ilike(workflowJobs.idempotencyKey, kw), ilike(workflowJobs.traceId, kw), ilike(workflowJobs.nodeKey, kw))!);
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [total, rows] = await Promise.all([
    db.$count(workflowJobs, where),
    db.select({ job: workflowJobs, instanceTitle: workflowInstances.title, definitionName: workflowDefinitions.name })
      .from(workflowJobs)
      .leftJoin(workflowInstances, eq(workflowJobs.instanceId, workflowInstances.id))
      .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
      .where(where)
      .orderBy(desc(workflowJobs.id))
      .limit(pageSize)
      .offset(pageOffset(page, pageSize)),
  ]);

  return { list: rows.map((r) => mapJob(r.job, { instanceTitle: r.instanceTitle, definitionName: r.definitionName })), total, page, pageSize };
}

export async function getWorkflowJobDetail(id: number) {
  const [row] = await db.select({ job: workflowJobs, instanceTitle: workflowInstances.title, definitionName: workflowDefinitions.name })
    .from(workflowJobs)
    .leftJoin(workflowInstances, eq(workflowJobs.instanceId, workflowInstances.id))
    .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
    .where(eq(workflowJobs.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: '作业不存在' });
  const execs = await db.select().from(workflowJobExecutions)
    .where(eq(workflowJobExecutions.jobId, id))
    .orderBy(desc(workflowJobExecutions.id));
  return { ...mapJob(row.job, { instanceTitle: row.instanceTitle, definitionName: row.definitionName }), executions: execs.map(mapExecution) };
}

/**
 * 链路视图：返回同一 traceId 关联的全部作业（按创建时间升序，即一次操作触发的完整异步 fan-out，
 * 含跨实例/子流程串联）+ 每个作业的执行明细 + 状态统计。
 */
export async function getWorkflowJobChain(traceId: string) {
  const rows = await db.select({ job: workflowJobs, instanceTitle: workflowInstances.title, definitionName: workflowDefinitions.name })
    .from(workflowJobs)
    .leftJoin(workflowInstances, eq(workflowJobs.instanceId, workflowInstances.id))
    .leftJoin(workflowDefinitions, eq(workflowInstances.definitionId, workflowDefinitions.id))
    .where(eq(workflowJobs.traceId, traceId))
    .orderBy(asc(workflowJobs.createdAt), asc(workflowJobs.id));
  const jobIds = rows.map((r) => r.job.id);
  const execs = jobIds.length > 0
    ? await db.select().from(workflowJobExecutions).where(inArray(workflowJobExecutions.jobId, jobIds)).orderBy(asc(workflowJobExecutions.id))
    : [];
  const execByJob = new Map<number, WorkflowJobExecutionRow[]>();
  for (const e of execs) {
    const list = execByJob.get(e.jobId) ?? [];
    list.push(e);
    execByJob.set(e.jobId, list);
  }
  const jobs = rows.map((r) => ({
    ...mapJob(r.job, { instanceTitle: r.instanceTitle, definitionName: r.definitionName }),
    executions: (execByJob.get(r.job.id) ?? []).map(mapExecution),
  }));
  const countBy = (s: WorkflowJobRow['status']) => jobs.filter((j) => j.status === s).length;
  return {
    traceId,
    jobs,
    stats: {
      total: jobs.length,
      pending: countBy('pending'),
      running: countBy('running'),
      succeeded: countBy('succeeded'),
      failed: countBy('failed'),
      dead: countBy('dead'),
      canceled: countBy('canceled'),
      instanceIds: [...new Set(jobs.map((j) => j.instanceId).filter((v): v is number => v != null))],
    },
  };
}

export async function retryWorkflowJob(id: number, payload?: Record<string, unknown>) {
  const row = await retryJob(id, payload ? { payload } : undefined);
  if (!row) throw new HTTPException(400, { message: '仅失败 / 死信 / 已取消的作业可重试' });
  return mapJob(row);
}

export async function skipWorkflowJob(id: number) {
  const row = await skipJob(id);
  if (!row) throw new HTTPException(400, { message: '仅待处理 / 失败 / 死信的作业可跳过' });
  return mapJob(row);
}

export interface WorkflowJobBatchResult {
  total: number;
  /** 成功执行的数量 */
  success: number;
  /** 因状态不满足而跳过的数量 */
  skipped: number;
}

/** 批量重试：逐个调用 retryJob，不满足条件（非 failed/dead/canceled）计入 skipped。 */
export async function batchRetryWorkflowJobs(ids: number[]): Promise<WorkflowJobBatchResult> {
  let success = 0;
  for (const id of ids) {
    const row = await retryJob(id);
    if (row) success += 1;
  }
  return { total: ids.length, success, skipped: ids.length - success };
}

/** 批量跳过：逐个调用 skipJob，不满足条件（非 pending/failed/dead）计入 skipped。 */
export async function batchSkipWorkflowJobs(ids: number[]): Promise<WorkflowJobBatchResult> {
  let success = 0;
  for (const id of ids) {
    const row = await skipJob(id);
    if (row) success += 1;
  }
  return { total: ids.length, success, skipped: ids.length - success };
}

const ALL_JOB_TYPES: WorkflowJobRow['jobType'][] = [
  'delay_wake', 'task_timeout', 'trigger_dispatch', 'external_dispatch',
  'subprocess_spawn', 'subprocess_join', 'event_dispatch', 'webhook_delivery',
];

interface WorkflowJobSummaryItem {
  jobType: WorkflowJobRow['jobType'];
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
  canceled: number;
}

/** 按作业类型 + 状态聚合计数，零填充所有 8 种类型，供作业账本 Tab 徽标使用。 */
export async function getWorkflowJobsSummary(): Promise<WorkflowJobSummaryItem[]> {
  const rows = await db
    .select({ jobType: workflowJobs.jobType, status: workflowJobs.status, c: count() })
    .from(workflowJobs)
    .groupBy(workflowJobs.jobType, workflowJobs.status);

  const map = new Map<WorkflowJobRow['jobType'], WorkflowJobSummaryItem>();
  for (const t of ALL_JOB_TYPES) {
    map.set(t, { jobType: t, total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, dead: 0, canceled: 0 });
  }
  for (const r of rows) {
    const item = map.get(r.jobType);
    if (!item) continue;
    const n = Number(r.c);
    item.total += n;
    item[r.status] += n;
  }
  return ALL_JOB_TYPES.map((t) => map.get(t)!);
}

/** 死信中心：重放全部死信作业（可按 jobType 过滤），逐个 retryJob。 */
export async function replayDeadJobs(jobType?: WorkflowJobRow['jobType']): Promise<WorkflowJobBatchResult> {
  const conds = [eq(workflowJobs.status, 'dead')];
  if (jobType) conds.push(eq(workflowJobs.jobType, jobType));
  const rows = await db.select({ id: workflowJobs.id }).from(workflowJobs).where(and(...conds)).limit(500);
  let success = 0;
  for (const r of rows) { if (await retryJob(r.id)) success += 1; }
  return { total: rows.length, success, skipped: rows.length - success };
}

/** 失败原因聚类：dead/failed 作业按 lastError 归一前缀聚合，便于定位高频故障。 */
export async function getJobFailureClusters(): Promise<Array<{ reason: string; count: number; jobTypes: string[] }>> {
  const rows = await db.select({ jobType: workflowJobs.jobType, lastError: workflowJobs.lastError })
    .from(workflowJobs).where(inArray(workflowJobs.status, ['dead', 'failed'])).limit(2000);
  const map = new Map<string, { count: number; types: Set<string> }>();
  for (const r of rows) {
    const reason = (r.lastError ?? '未知错误').replace(/\d+/g, 'N').slice(0, 60);
    const e = map.get(reason) ?? { count: 0, types: new Set<string>() };
    e.count++; e.types.add(r.jobType); map.set(reason, e);
  }
  return [...map.entries()].map(([reason, v]) => ({ reason, count: v.count, jobTypes: [...v.types] })).sort((a, b) => b.count - a.count).slice(0, 20);
}
