CREATE TYPE "public"."app_kind" AS ENUM('client', 'service');--> statement-breakpoint
CREATE TYPE "public"."deploy_host_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'rolled_back', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deploy_log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."deploy_restart_mode" AS ENUM('systemd', 'script', 'none');--> statement-breakpoint
CREATE TYPE "public"."deploy_run_kind" AS ENUM('deploy', 'rollback', 'restart');--> statement-breakpoint
CREATE TYPE "public"."deploy_run_status" AS ENUM('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deploy_step" AS ENUM('preflight', 'upload', 'unpack', 'before_switch', 'switch', 'restart', 'health_check', 'prune');--> statement-breakpoint
CREATE TYPE "public"."deploy_strategy" AS ENUM('rolling', 'parallel');--> statement-breakpoint
ALTER TYPE "public"."app_artifact_kind" ADD VALUE 'archive';--> statement-breakpoint
ALTER TYPE "public"."app_platform" ADD VALUE 'server';--> statement-breakpoint
CREATE TABLE "deploy_releases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deploy_releases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"app_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"host_id" integer NOT NULL,
	"release_name" varchar(80) NOT NULL,
	"version" varchar(32) NOT NULL,
	"app_release_id" integer,
	"artifact_id" integer,
	"run_id" integer,
	"is_current" boolean DEFAULT false NOT NULL,
	"size_bytes" bigint,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_releases_target_host_name_unique" UNIQUE("target_id","host_id","release_name")
);
--> statement-breakpoint
CREATE TABLE "deploy_run_hosts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deploy_run_hosts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"host_id" integer NOT NULL,
	"status" "deploy_host_status" DEFAULT 'pending' NOT NULL,
	"step" "deploy_step",
	"release_name" varchar(80),
	"previous_release_name" varchar(80),
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	CONSTRAINT "deploy_run_hosts_run_host_unique" UNIQUE("run_id","host_id")
);
--> statement-breakpoint
CREATE TABLE "deploy_run_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deploy_run_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"host_id" integer,
	"seq" integer NOT NULL,
	"level" "deploy_log_level" DEFAULT 'info' NOT NULL,
	"step" "deploy_step",
	"line" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_run_logs_run_seq_unique" UNIQUE("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "deploy_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deploy_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"app_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"kind" "deploy_run_kind" NOT NULL,
	"status" "deploy_run_status" DEFAULT 'pending' NOT NULL,
	"app_release_id" integer,
	"version" varchar(32),
	"artifact_id" integer,
	"release_name" varchar(80),
	"async_task_id" integer,
	"snapshot" jsonb NOT NULL,
	"host_total" smallint DEFAULT 0 NOT NULL,
	"host_succeeded" smallint DEFAULT 0 NOT NULL,
	"host_failed" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"remark" varchar(500),
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploy_target_hosts" (
	"target_id" integer NOT NULL,
	"host_id" integer NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "deploy_target_hosts_target_id_host_id_pk" PRIMARY KEY("target_id","host_id")
);
--> statement-breakpoint
CREATE TABLE "deploy_targets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deploy_targets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"app_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"deploy_path" varchar(255) NOT NULL,
	"shared_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keep_releases" smallint DEFAULT 5 NOT NULL,
	"restart_mode" "deploy_restart_mode" DEFAULT 'systemd' NOT NULL,
	"service_name" varchar(128),
	"scripts" jsonb DEFAULT '{"beforeSwitch":null,"restart":null}'::jsonb NOT NULL,
	"health_check" jsonb NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_rollback" boolean DEFAULT true NOT NULL,
	"strategy" "deploy_strategy" DEFAULT 'rolling' NOT NULL,
	"max_parallel" smallint DEFAULT 2 NOT NULL,
	"stop_on_failure" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"remark" varchar(500),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_targets_app_name_unique" UNIQUE("app_id","name")
);
--> statement-breakpoint
ALTER TABLE "client_apps" ADD COLUMN "kind" "app_kind" DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_app_id_client_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."client_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."deploy_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_host_id_ops_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."ops_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_app_release_id_app_releases_id_fk" FOREIGN KEY ("app_release_id") REFERENCES "public"."app_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_artifact_id_app_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."app_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_releases" ADD CONSTRAINT "deploy_releases_run_id_deploy_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."deploy_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_run_hosts" ADD CONSTRAINT "deploy_run_hosts_run_id_deploy_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."deploy_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_run_hosts" ADD CONSTRAINT "deploy_run_hosts_host_id_ops_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."ops_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_run_logs" ADD CONSTRAINT "deploy_run_logs_run_id_deploy_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."deploy_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_run_logs" ADD CONSTRAINT "deploy_run_logs_host_id_ops_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."ops_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_app_id_client_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."client_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."deploy_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_app_release_id_app_releases_id_fk" FOREIGN KEY ("app_release_id") REFERENCES "public"."app_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_artifact_id_app_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."app_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_async_task_id_async_tasks_id_fk" FOREIGN KEY ("async_task_id") REFERENCES "public"."async_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_target_hosts" ADD CONSTRAINT "deploy_target_hosts_target_id_deploy_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."deploy_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_target_hosts" ADD CONSTRAINT "deploy_target_hosts_host_id_ops_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."ops_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_targets" ADD CONSTRAINT "deploy_targets_app_id_client_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."client_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_targets" ADD CONSTRAINT "deploy_targets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_targets" ADD CONSTRAINT "deploy_targets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deploy_releases_target_host_idx" ON "deploy_releases" USING btree ("target_id","host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_releases_current_unique" ON "deploy_releases" USING btree ("target_id","host_id") WHERE "deploy_releases"."is_current" = true;--> statement-breakpoint
CREATE INDEX "deploy_runs_target_created_idx" ON "deploy_runs" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "deploy_runs_app_created_idx" ON "deploy_runs" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_runs_target_active_unique" ON "deploy_runs" USING btree ("target_id") WHERE "deploy_runs"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "deploy_target_hosts_host_idx" ON "deploy_target_hosts" USING btree ("host_id");