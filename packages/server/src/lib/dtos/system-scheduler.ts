import { z } from '@hono/zod-openapi';

export const SystemSchedulerTaskTypeDTO = z.enum(['recurring', 'queue']);
export const SystemSchedulerRunStatusDTO = z.enum(['running', 'success', 'failed']);
export const SystemSchedulerTriggerTypeDTO = z.enum(['schedule', 'manual', 'queue']);

export const SystemSchedulerTaskDTO = z
  .object({
    name: z.string(),
    title: z.string(),
    module: z.string(),
    description: z.string().nullable(),
    taskType: SystemSchedulerTaskTypeDTO,
    cronExpression: z.string().nullable(),
    registeredAt: z.string(),
    allowManualRun: z.boolean(),
    nextRunAt: z.string().nullable(),
    running: z.boolean(),
    lastRunAt: z.string().nullable(),
    lastRunStatus: SystemSchedulerRunStatusDTO.nullable(),
    lastRunMessage: z.string().nullable(),
    lastDurationMs: z.number().int().nullable(),
    totalRuns: z.number().int(),
    successCount: z.number().int(),
    failedCount: z.number().int(),
  })
  .openapi('SystemSchedulerTask');

export const SystemSchedulerRunDTO = z
  .object({
    id: z.number().int(),
    taskName: z.string(),
    taskTitle: z.string(),
    taskType: SystemSchedulerTaskTypeDTO,
    module: z.string(),
    triggerType: SystemSchedulerTriggerTypeDTO,
    status: SystemSchedulerRunStatusDTO,
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    resultMessage: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('SystemSchedulerRun');

export const SystemSchedulerRunResultDTO = z
  .object({
    message: z.string(),
  })
  .openapi('SystemSchedulerRunResult');
