import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { CronExpressionParser } from 'cron-parser';
import { db } from '../db';
import { systemSchedulerRuns } from '../db/schema';
import { formatDateTime, formatNullableDateTime } from '../lib/datetime';
import { getSchedulerIntrospection, runSystemRecurringJobNow, type SystemSchedulerRunStatus, type SystemSchedulerTaskInfo } from '../lib/pg-boss-scheduler';
import { withPagination } from '../lib/where-helpers';

export interface ListSystemSchedulerRunsQuery {
  page: number;
  pageSize: number;
  taskName?: string;
  taskType?: 'recurring' | 'queue';
  triggerType?: 'schedule' | 'manual' | 'queue';
  status?: SystemSchedulerRunStatus;
}

function nextCronRun(cronExpression: string): string | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression.trim(), { currentDate: new Date(), tz: 'Asia/Shanghai' });
    return formatDateTime(interval.next().toDate());
  } catch {
    return null;
  }
}

function mapRun(row: typeof systemSchedulerRuns.$inferSelect) {
  return {
    id: row.id,
    taskName: row.taskName,
    taskTitle: row.taskTitle,
    taskType: row.taskType,
    module: row.module,
    triggerType: row.triggerType,
    status: row.status,
    startedAt: formatDateTime(row.startedAt),
    endedAt: formatNullableDateTime(row.endedAt),
    durationMs: row.durationMs,
    resultMessage: row.resultMessage,
    errorMessage: row.errorMessage,
    createdAt: formatDateTime(row.createdAt),
  };
}

export async function listSystemSchedulerTasks() {
  const scheduler = getSchedulerIntrospection();
  const registeredTasks: SystemSchedulerTaskInfo[] = [
    ...scheduler.systemRecurringJobs,
    ...scheduler.systemQueueWorkers,
  ];
  const statsRows = await db.select({
    taskName: systemSchedulerRuns.taskName,
    totalRuns: sql<number>`cast(count(*) as int)`,
    successCount: sql<number>`cast(count(*) filter (where ${systemSchedulerRuns.status} = 'success') as int)`,
    failedCount: sql<number>`cast(count(*) filter (where ${systemSchedulerRuns.status} = 'failed') as int)`,
  }).from(systemSchedulerRuns).groupBy(systemSchedulerRuns.taskName);

  const latestRows = await Promise.all(registeredTasks.map((task) =>
    db.select()
      .from(systemSchedulerRuns)
      .where(eq(systemSchedulerRuns.taskName, task.name))
      .orderBy(desc(systemSchedulerRuns.startedAt), desc(systemSchedulerRuns.id))
      .limit(1),
  ));

  const statsMap = new Map(statsRows.map((row) => [row.taskName, row]));
  const latestMap = new Map(latestRows.flat().map((row) => [row.taskName, row]));
  const wipMap = new Map(scheduler.wip.map((item) => [item.name, item.count]));

  return registeredTasks
    .map((task) => {
      const stats = statsMap.get(task.name);
      const latest = latestMap.get(task.name);
      return {
        name: task.name,
        title: task.title,
        module: task.module,
        description: task.description,
        taskType: task.taskType,
        cronExpression: task.cronExpression,
        registeredAt: task.registeredAt,
        allowManualRun: task.allowManualRun,
        nextRunAt: task.taskType === 'recurring' && task.cronExpression ? nextCronRun(task.cronExpression) : null,
        running: (wipMap.get(task.name) ?? 0) > 0 || latest?.status === 'running',
        lastRunAt: latest ? formatDateTime(latest.startedAt) : task.lastRunAt,
        lastRunStatus: latest?.status ?? task.lastRunStatus,
        lastRunMessage: latest?.errorMessage ?? latest?.resultMessage ?? task.lastRunMessage,
        lastDurationMs: latest?.durationMs ?? task.lastDurationMs,
        totalRuns: stats?.totalRuns ?? 0,
        successCount: stats?.successCount ?? 0,
        failedCount: stats?.failedCount ?? 0,
      };
    })
    .sort((a, b) => a.module.localeCompare(b.module, 'zh-Hans-CN') || a.title.localeCompare(b.title, 'zh-Hans-CN'));
}

export async function listSystemSchedulerRuns(query: ListSystemSchedulerRunsQuery) {
  const { page, pageSize } = query;
  const conditions: SQL[] = [];
  if (query.taskName) conditions.push(eq(systemSchedulerRuns.taskName, query.taskName));
  if (query.taskType) conditions.push(eq(systemSchedulerRuns.taskType, query.taskType));
  if (query.triggerType) conditions.push(eq(systemSchedulerRuns.triggerType, query.triggerType));
  if (query.status) conditions.push(eq(systemSchedulerRuns.status, query.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [total, rows] = await Promise.all([
    db.$count(systemSchedulerRuns, where),
    withPagination(
      db.select().from(systemSchedulerRuns).where(where).orderBy(desc(systemSchedulerRuns.startedAt), desc(systemSchedulerRuns.id)).$dynamic(),
      page,
      pageSize,
    ),
  ]);
  return { list: rows.map(mapRun), total, page, pageSize };
}

export async function runSystemSchedulerTask(name: string) {
  try {
    const message = await runSystemRecurringJobNow(name);
    return { message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('不存在')) throw new HTTPException(404, { message });
    throw new HTTPException(400, { message });
  }
}
