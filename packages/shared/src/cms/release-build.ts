import * as z from 'zod';

/** Cumulative work durations may exceed wall time when targets run concurrently. */
export const cmsBuildPerformanceSchema = z.object({
  concurrency: z.int().min(1), targetCount: z.int().min(0), completedTargets: z.int().min(0),
  queryCount: z.int().min(0), queryMs: z.number().min(0), renderMs: z.number().min(0),
  fileMs: z.number().min(0), checkpointMs: z.number().min(0), checkpointFlushes: z.int().min(0),
  sharedCacheHits: z.int().min(0), sharedCacheMisses: z.int().min(0),
  slowestTargets: z.array(z.object({ key: z.string(), elapsedMs: z.number().min(0), queryCount: z.int().min(0), queryMs: z.number().min(0), renderMs: z.number().min(0), fileMs: z.number().min(0), outcome: z.enum(['generated', 'reused', 'resumed', 'failed']) })).max(20),
});
export type CmsBuildPerformance = z.infer<typeof cmsBuildPerformanceSchema>;
