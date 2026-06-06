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
}).openapi('CronJobStatsPerJob');

export const CronJobStatsDTO = z.object({
  totalJobs: z.number().int(),
  enabledJobs: z.number().int(),
  todayRuns: z.number().int(),
  todaySuccesses: z.number().int(),
  todayFails: z.number().int(),
  perJob: z.array(CronJobStatsPerJobDTO),
}).openapi('CronJobStats');
