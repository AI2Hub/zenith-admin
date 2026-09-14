DROP INDEX "system_scheduler_runs_task_idx";--> statement-breakpoint
CREATE INDEX "system_scheduler_runs_task_started_idx" ON "system_scheduler_runs" USING btree ("task_name","started_at","id");--> statement-breakpoint
CREATE INDEX "user_events_app_created_idx" ON "user_events" USING btree ("app_id","created_at");