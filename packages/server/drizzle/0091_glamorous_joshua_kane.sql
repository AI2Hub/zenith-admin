ALTER TABLE "cron_jobs" ADD COLUMN "retry_backoff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_jobs" DROP COLUMN "next_run_at";