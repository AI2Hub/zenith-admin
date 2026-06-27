-- 工作流统一作业账本（workflow_jobs）落地。
-- 注意：本迁移仅包含 workflow 相关变更。身份源相关对象（identity_provider_* 枚举与
-- tenant_identity_providers / user_identity_accounts / identity_provider_sync_logs 表）
-- 已由 0181/0182/0183 手写迁移建立；本次仅在快照（0184_snapshot.json）中补齐其状态以
-- 修复快照漂移，故此 SQL 不再重复创建，避免在已存在这些对象的库上报错。
CREATE TYPE "public"."workflow_job_execution_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'dead', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."workflow_job_type" AS ENUM('delay_wake', 'task_timeout', 'trigger_dispatch', 'external_dispatch', 'subprocess_spawn', 'subprocess_join', 'event_dispatch', 'webhook_delivery');--> statement-breakpoint
CREATE TABLE "workflow_job_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"job_type" "workflow_job_type" NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"status" "workflow_job_execution_status" DEFAULT 'running' NOT NULL,
	"request_url" varchar(512),
	"request_method" varchar(16),
	"request_body" text,
	"response_status" integer,
	"response_body" text,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" "workflow_job_type" NOT NULL,
	"status" "workflow_job_status" DEFAULT 'pending' NOT NULL,
	"instance_id" integer,
	"task_id" integer,
	"node_key" varchar(64),
	"idempotency_key" varchar(160),
	"trace_id" varchar(64),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(64),
	"last_error" text,
	"result" jsonb,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
DROP TABLE "workflow_event_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_event_outbox" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_trigger_executions" CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_job_executions" ADD CONSTRAINT "workflow_job_executions_job_id_workflow_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."workflow_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_job_executions" ADD CONSTRAINT "workflow_job_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_task_id_workflow_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."workflow_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_job_executions_job_idx" ON "workflow_job_executions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "workflow_job_executions_type_idx" ON "workflow_job_executions" USING btree ("job_type","status");--> statement-breakpoint
CREATE INDEX "workflow_jobs_due_idx" ON "workflow_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "workflow_jobs_type_status_idx" ON "workflow_jobs" USING btree ("job_type","status");--> statement-breakpoint
CREATE INDEX "workflow_jobs_trace_idx" ON "workflow_jobs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "workflow_jobs_instance_idx" ON "workflow_jobs" USING btree ("instance_id");--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "external_dispatch_status";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "trigger_dispatch_status";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "trigger_attempt";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "trigger_started_at";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "trigger_next_retry_at";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "trigger_last_error";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "wake_at";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "timeout_at";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "timeout_remind_count";--> statement-breakpoint
DROP TYPE "public"."workflow_event_delivery_status";--> statement-breakpoint
DROP TYPE "public"."workflow_task_external_dispatch_status";--> statement-breakpoint
DROP TYPE "public"."workflow_trigger_execution_status";
