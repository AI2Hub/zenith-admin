ALTER TYPE "public"."frontend_error_type" ADD VALUE 'server_exception';--> statement-breakpoint
ALTER TYPE "public"."frontend_error_type" ADD VALUE 'job_failure';--> statement-breakpoint
ALTER TYPE "public"."frontend_error_type" ADD VALUE 'cron_failure';--> statement-breakpoint
ALTER TYPE "public"."frontend_error_type" ADD VALUE 'event_failure';--> statement-breakpoint
ALTER TYPE "public"."frontend_error_type" ADD VALUE 'process_crash';--> statement-breakpoint
ALTER TYPE "public"."frontend_error_type" ADD VALUE 'logged_error';--> statement-breakpoint
ALTER TABLE "error_alert_rules" ADD COLUMN "source" "analytics_event_source";--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "trace_id" varchar(64);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "route" varchar(256);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "error_name" varchar(128);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "job_type" varchar(64);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "job_id" varchar(64);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "process_role" varchar(16);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "hostname" varchar(128);--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "pid" integer;--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "affected_tenant_id" integer;--> statement-breakpoint
ALTER TABLE "error_groups" ADD COLUMN "source" "analytics_event_source" DEFAULT 'web_admin' NOT NULL;--> statement-breakpoint
CREATE INDEX "error_events_trace_idx" ON "error_events" USING btree ("trace_id") WHERE "error_events"."trace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "error_groups_source_last_seen_idx" ON "error_groups" USING btree ("source","last_seen_at");