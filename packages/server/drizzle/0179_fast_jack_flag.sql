ALTER TYPE "public"."monitor_metric" ADD VALUE 'workflowHealth';--> statement-breakpoint
ALTER TYPE "public"."monitor_metric" ADD VALUE 'workflowBacklog';--> statement-breakpoint
CREATE TABLE "workflow_engine_health_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"health_score" smallint NOT NULL,
	"severity" varchar(16) DEFAULT 'healthy' NOT NULL,
	"backlog" integer DEFAULT 0 NOT NULL,
	"error_rate" real DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"running_instances" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workflow_engine_health_snapshots_created_at_idx" ON "workflow_engine_health_snapshots" USING btree ("created_at");