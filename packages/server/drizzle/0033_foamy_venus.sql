ALTER TABLE "cron_job_logs" ADD COLUMN "execution_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD COLUMN "retry_interval" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD COLUMN "monitor_timeout" integer;