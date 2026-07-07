/**
 * 定时任务相关 DTO
 */
import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

export const CronJobDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '数据库备份' }),
    cronExpression: z.string().openapi({ example: '0 0 2 * * *' }),
    handler: z.string().openapi({ example: 'backupDatabase' }),
    params: z.string().nullable(),
    status: z.enum(['enabled', 'disabled']),
    description: z.string(),
    retryCount: z.number().int(),
    /** 重试间隔，单位：秒 */
    retryInterval: z.number().int(),
    retryBackoff: z.boolean(),
    monitorTimeout: z.number().int().nullable(),
    lastRunAt: z.string().nullable(),
    lastRunStatus: z.enum(['success', 'fail', 'running']).nullable(),
    lastRunMessage: z.string().nullable(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('CronJob');

export const CronJobLogDTO = z
  .object({
    id: z.number().int(),
    jobId: z.number().int(),
    jobName: z.string(),
    executionCount: z.number().int(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    status: z.enum(['success', 'fail', 'running']),
    output: z.string().nullable(),
  })
  .openapi('CronJobLog');

export const CronJobStatsPerJobDTO = z.object({
  jobId: z.number().int(),
  jobName: z.string(),
  totalRuns: z.number().int(),
  successCount: z.number().int(),
  failCount: z.number().int(),
  successRate: z.number(),
  avgDurationMs: z.number().int().nullable(),
  /** P95 耗时（长尾性能） */
  p95DurationMs: z.number().int().nullable(),
  /** 近 10 次执行状态（旧 → 新） */
  recentResults: z.array(z.enum(['success', 'fail', 'running'])),
  /** 当前连续失败次数 */
  consecutiveFails: z.number().int(),
  lastRunStatus: z.enum(['success', 'fail', 'running']).nullable(),
  lastRunAt: z.string().nullable(),
}).openapi('CronJobStatsPerJob');

export const CronJobDailyStatDTO = z.object({
  date: z.string().openapi({ example: '2026-06-22' }),
  total: z.number().int(),
  successCount: z.number().int(),
  failCount: z.number().int(),
  /** 当日已完成执行的平均耗时 */
  avgDurationMs: z.number().int().nullable(),
}).openapi('CronJobDailyStat');

export const CronJobHourlyStatDTO = z.object({
  hour: z.number().int().min(0).max(23),
  total: z.number().int(),
  failCount: z.number().int(),
}).openapi('CronJobHourlyStat');

export const CronJobRecentLogDTO = z.object({
  id: z.number().int(),
  jobId: z.number().int(),
  jobName: z.string(),
  status: z.enum(['success', 'fail', 'running']),
  durationMs: z.number().int().nullable(),
  startedAt: z.string(),
  executionCount: z.number().int(),
  output: z.string().nullable(),
}).openapi('CronJobRecentLog');

export const CronJobStatsDTO = z.object({
  totalJobs: z.number().int(),
  enabledJobs: z.number().int(),
  runningJobs: z.number().int(),
  todayRuns: z.number().int(),
  todaySuccesses: z.number().int(),
  todayFails: z.number().int(),
  todayAvgDurationMs: z.number().int().nullable(),
  perJob: z.array(CronJobStatsPerJobDTO),
  dailyStats: z.array(CronJobDailyStatDTO),
  /** 近 7 天按小时执行分布 */
  hourlyStats: z.array(CronJobHourlyStatDTO),
  recentLogs: z.array(CronJobRecentLogDTO),
}).openapi('CronJobStats');
