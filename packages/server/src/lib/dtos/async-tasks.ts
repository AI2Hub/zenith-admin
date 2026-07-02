import { z } from '@hono/zod-openapi';

export const AsyncTaskStatusDTO = z.enum(['pending', 'running', 'success', 'failed', 'cancelled']);

export const AsyncTaskDTO = z
  .object({
    id: z.number().int(),
    taskType: z.string(),
    title: z.string(),
    module: z.string().nullable(),
    status: AsyncTaskStatusDTO,
    payload: z.record(z.string(), z.unknown()),
    totalCount: z.number().int().nullable(),
    processedCount: z.number().int(),
    failedCount: z.number().int(),
    progressNote: z.string().nullable(),
    result: z.record(z.string(), z.unknown()).nullable(),
    errorMessage: z.string().nullable(),
    cancelRequested: z.boolean(),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    nextRunAt: z.string().nullable(),
    createdBy: z.number().int().nullable(),
    createdByName: z.string().nullable(),
    tenantId: z.number().int().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('AsyncTask');

export const AsyncTaskTypeMetaDTO = z
  .object({
    taskType: z.string(),
    title: z.string(),
    module: z.string(),
    description: z.string().nullable(),
    allowConcurrent: z.boolean(),
    enabled: z.boolean(),
    maxAttempts: z.number().int(),
    retryDelayMs: z.number().int(),
    retentionDays: z.number().int().nullable(),
  })
  .openapi('AsyncTaskTypeMeta');

export const AsyncTaskItemDTO = z
  .object({
    id: z.number().int(),
    taskId: z.number().int(),
    itemKey: z.string(),
    label: z.string().nullable(),
    status: z.enum(['pending', 'success', 'failed', 'skipped']),
    message: z.string().nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    attempt: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('AsyncTaskItem');

export const AsyncTaskStatsDTO = z
  .object({
    total: z.number().int(),
    pending: z.number().int(),
    running: z.number().int(),
    success: z.number().int(),
    failed: z.number().int(),
    cancelled: z.number().int(),
    avgDurationMs: z.number().int().nullable(),
    daily: z.array(z.object({
      date: z.string(),
      submitted: z.number().int(),
      failed: z.number().int(),
    })),
  })
  .openapi('AsyncTaskStats');

export const AsyncTaskBatchResultDTO = z
  .object({ affected: z.number().int() })
  .openapi('AsyncTaskBatchResult');

export const AsyncTaskCleanupResultDTO = z
  .object({ cleaned: z.number().int() })
  .openapi('AsyncTaskCleanupResult');
