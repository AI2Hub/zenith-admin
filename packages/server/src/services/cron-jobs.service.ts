import { cronJobs } from '../db/schema';

export function mapCronJob(row: typeof cronJobs.$inferSelect) {
  return {
    ...row,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
