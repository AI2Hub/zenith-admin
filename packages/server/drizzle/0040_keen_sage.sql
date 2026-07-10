CREATE TYPE "public"."report_resource_type" AS ENUM('datasource', 'dataset', 'dashboard', 'metric', 'print_template', 'fill_template', 'asset_template');--> statement-breakpoint
CREATE TYPE "public"."report_acl_role" AS ENUM('viewer', 'editor', 'owner');--> statement-breakpoint
CREATE TYPE "public"."report_acl_subject_type" AS ENUM('user', 'role', 'department', 'user_group');--> statement-breakpoint
CREATE TYPE "public"."report_approval_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_asset_template_type" AS ENUM('dashboard', 'widget', 'print', 'semantic_model');--> statement-breakpoint
CREATE TYPE "public"."report_chatbi_message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."report_chatbi_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."report_dq_anomaly_status" AS ENUM('open', 'acknowledged', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."report_dq_rule_type" AS ENUM('not_null', 'uniqueness', 'range', 'pattern', 'freshness', 'row_count', 'custom_sql');--> statement-breakpoint
CREATE TYPE "public"."report_dq_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_dq_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."report_environment_kind" AS ENUM('development', 'testing', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."report_fill_record_status" AS ENUM('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_fill_sync_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_fill_template_status" AS ENUM('draft', 'published', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."report_materialization_strategy" AS ENUM('full', 'incremental');--> statement-breakpoint
CREATE TYPE "public"."report_metric_lifecycle_status" AS ENUM('draft', 'published', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."report_metric_type" AS ENUM('simple', 'ratio', 'composite');--> statement-breakpoint
CREATE TYPE "public"."report_promotion_status" AS ENUM('pending', 'approved', 'deploying', 'succeeded', 'failed', 'cancelled', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."report_quota_scope" AS ENUM('tenant', 'user');--> statement-breakpoint
CREATE TYPE "public"."report_sla_type" AS ENUM('freshness', 'query_latency_p95', 'availability', 'dq_score');--> statement-breakpoint
CREATE TYPE "public"."report_sla_violation_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."report_snapshot_status" AS ENUM('pending', 'building', 'ready', 'failed', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."report_transfer_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."export_job_format" ADD VALUE 'docx';--> statement-breakpoint
ALTER TYPE "public"."report_delivery_target_type" ADD VALUE 'sla';--> statement-breakpoint
CREATE TABLE "report_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"parent_id" integer,
	"name" varchar(64) NOT NULL,
	"resource_type" "report_resource_type" NOT NULL,
	"owner_id" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_asset_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"folder_id" integer,
	"owner_id" integer,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "report_asset_template_type" NOT NULL,
	"description" text,
	"content" jsonb NOT NULL,
	"preview_file_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_asset_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(16) NOT NULL,
	"scene" varchar(64),
	"duration_ms" integer,
	"row_count" bigint DEFAULT 0 NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_chatbi_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"session_id" integer NOT NULL,
	"user_id" integer,
	"role" "report_chatbi_message_role" NOT NULL,
	"content" text NOT NULL,
	"generated_sql" text,
	"chart_suggestion" jsonb,
	"result_sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_row_count" bigint DEFAULT 0 NOT NULL,
	"result_byte_size" bigint DEFAULT 0 NOT NULL,
	"saved_resource_type" "report_resource_type",
	"saved_resource_id" integer,
	"saved_dataset_id" integer,
	"saved_dashboard_id" integer,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_units" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"model_id" varchar(128),
	"error_message" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_chatbi_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"user_id" integer NOT NULL,
	"title" varchar(128) NOT NULL,
	"datasource_id" integer,
	"dataset_id" integer,
	"allowed_tables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"status" "report_chatbi_session_status" DEFAULT 'active' NOT NULL,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	"total_cost_units" double precision DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_deprecation_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"title" varchar(128) NOT NULL,
	"message" text NOT NULL,
	"replacement_resource_type" "report_resource_type",
	"replacement_resource_id" integer,
	"effective_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" integer,
	"processed_at" timestamp with time zone,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dq_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"dataset_id" integer NOT NULL,
	"rule_id" integer,
	"run_id" integer,
	"severity" "report_dq_severity" NOT NULL,
	"title" varchar(256) NOT NULL,
	"detail" text,
	"sample" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_row_count" integer DEFAULT 0 NOT NULL,
	"sample_bytes" bigint DEFAULT 0 NOT NULL,
	"status" "report_dq_anomaly_status" DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" integer,
	"acknowledgement_note" varchar(1000),
	"resolved_at" timestamp with time zone,
	"resolved_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dq_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"dataset_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "report_dq_rule_type" NOT NULL,
	"field" varchar(128),
	"severity" "report_dq_severity" DEFAULT 'medium' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cron" varchar(64),
	"timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" "report_dq_run_status",
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dq_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"rule_id" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"status" "report_dq_run_status" DEFAULT 'pending' NOT NULL,
	"trigger_type" varchar(32) NOT NULL,
	"checked_rows" bigint DEFAULT 0 NOT NULL,
	"failed_rows" bigint DEFAULT 0 NOT NULL,
	"pass_rate" double precision,
	"sample_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_row_count" integer DEFAULT 0 NOT NULL,
	"sample_bytes" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_message" varchar(1000),
	"schema_signature" varchar(128),
	"requested_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dq_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"dataset_id" integer NOT NULL,
	"score" double precision NOT NULL,
	"passed_rules" integer DEFAULT 0 NOT NULL,
	"failed_rules" integer DEFAULT 0 NOT NULL,
	"total_rules" integer DEFAULT 0 NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_environment_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"source_environment_id" integer NOT NULL,
	"target_environment_id" integer NOT NULL,
	"source_revision" integer NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"target_snapshot" jsonb,
	"rollback_snapshot" jsonb,
	"status" "report_promotion_status" DEFAULT 'pending' NOT NULL,
	"requested_by" integer,
	"approved_by" integer,
	"deployed_by" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" varchar(1000),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"kind" "report_environment_kind" NOT NULL,
	"description" varchar(500),
	"base_url" varchar(1024),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_fill_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"template_id" integer NOT NULL,
	"submitter_id" integer NOT NULL,
	"status" "report_fill_record_status" DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template_revision" integer NOT NULL,
	"template_schema_snapshot" jsonb NOT NULL,
	"template_need_review" boolean NOT NULL,
	"workflow_definition_id_snapshot" integer,
	"submit_comment" varchar(1000),
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" integer,
	"review_comment" varchar(1000),
	"workflow_instance_id" integer,
	"generated_dataset_id" integer,
	"sync_status" "report_fill_sync_status" DEFAULT 'pending' NOT NULL,
	"sync_task_id" integer,
	"sync_error" varchar(1000),
	"synced_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_fill_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"folder_id" integer,
	"owner_id" integer,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"form_schema" jsonb NOT NULL,
	"published_schema" jsonb,
	"published_revision" integer,
	"workflow_definition_id" integer,
	"need_review" boolean DEFAULT false NOT NULL,
	"generated_dataset_id" integer,
	"status" "report_fill_template_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_materialization_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"dataset_id" integer NOT NULL,
	"strategy" "report_materialization_strategy" DEFAULT 'full' NOT NULL,
	"status" "report_snapshot_status" DEFAULT 'pending' NOT NULL,
	"revision" integer NOT NULL,
	"key_field" varchar(128),
	"watermark" varchar(256),
	"delta_window_minutes" integer,
	"file_id" uuid,
	"inline_data" jsonb,
	"row_count" bigint DEFAULT 0 NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"checksum" varchar(128),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error_message" varchar(1000),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"folder_id" integer,
	"owner_id" integer,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"type" "report_metric_type" NOT NULL,
	"dataset_id" integer NOT NULL,
	"source_field" varchar(128),
	"formula" text,
	"aggregate" varchar(32),
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_field" varchar(128),
	"unit" varchar(32),
	"format" varchar(128),
	"caliber" text,
	"lifecycle_status" "report_metric_lifecycle_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_snapshot" jsonb,
	"published_at" timestamp with time zone,
	"published_by" integer,
	"deprecated_at" timestamp with time zone,
	"deprecated_by" integer,
	"deprecation_reason" varchar(500),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_publish_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"action" varchar(16) NOT NULL,
	"requested_revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "report_approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"decision_note" varchar(1000),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_query_cost_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"user_id" integer,
	"dataset_id" integer,
	"datasource_id" integer,
	"scene" varchar(64) NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"queued_ms" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"row_count" bigint DEFAULT 0 NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"cost_units" double precision DEFAULT 0 NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" varchar(64),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_query_quotas" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"scope" "report_quota_scope" NOT NULL,
	"user_id" integer,
	"max_concurrent" integer NOT NULL,
	"daily_query_limit" bigint DEFAULT 0 NOT NULL,
	"daily_row_limit" bigint DEFAULT 0 NOT NULL,
	"daily_byte_limit" bigint DEFAULT 0 NOT NULL,
	"daily_cost_limit" double precision DEFAULT 0 NOT NULL,
	"reset_timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_resource_acls" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"subject_type" "report_acl_subject_type" NOT NULL,
	"subject_id" integer NOT NULL,
	"role" "report_acl_role" NOT NULL,
	"inherit_from_folder" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_resource_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"resource_type" "report_resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"from_owner_id" integer,
	"to_owner_id" integer NOT NULL,
	"status" "report_transfer_status" DEFAULT 'pending' NOT NULL,
	"reason" varchar(500),
	"requested_by" integer,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"decision_note" varchar(500),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_sla_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"dataset_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "report_sla_type" NOT NULL,
	"target_value" double precision NOT NULL,
	"warning_value" double precision,
	"window_minutes" integer NOT NULL,
	"cron" varchar(64),
	"timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	"severity" "report_dq_severity" DEFAULT 'high' NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" varchar(512),
	"webhook_url" varchar(512),
	"silence_mins" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_evaluated_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_sla_violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"rule_id" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"status" "report_sla_violation_status" DEFAULT 'open' NOT NULL,
	"observed_value" double precision NOT NULL,
	"target_value" double precision NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_ended_at" timestamp with time zone NOT NULL,
	"detail" text,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" integer,
	"resolved_at" timestamp with time zone,
	"resolved_by" integer,
	"resolution_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_dashboards" DROP CONSTRAINT "report_dashboards_name_unique";--> statement-breakpoint
ALTER TABLE "report_datasets" DROP CONSTRAINT "report_datasets_name_unique";--> statement-breakpoint
ALTER TABLE "report_datasources" DROP CONSTRAINT "report_datasources_name_unique";--> statement-breakpoint
ALTER TABLE "report_print_templates" DROP CONSTRAINT "report_print_templates_name_unique";--> statement-breakpoint
DROP INDEX "report_dashboards_tenant_idx";--> statement-breakpoint
DROP INDEX "report_dashboards_lifecycle_idx";--> statement-breakpoint
DROP INDEX "report_datasets_tenant_idx";--> statement-breakpoint
DROP INDEX "report_datasources_tenant_idx";--> statement-breakpoint
DROP INDEX "report_print_templates_tenant_idx";--> statement-breakpoint
ALTER TABLE "report_alert_rules" ALTER COLUMN "dataset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_alert_rules" ADD COLUMN "metric_id" integer;--> statement-breakpoint
ALTER TABLE "report_dashboards" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "report_dashboards" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "report_datasources" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "report_datasources" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "report_delivery_runs" ADD COLUMN "sla_rule_id" integer;--> statement-breakpoint
ALTER TABLE "report_print_templates" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "report_print_templates" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "report_folders" ADD CONSTRAINT "report_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_folders" ADD CONSTRAINT "report_folders_parent_id_report_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_folders" ADD CONSTRAINT "report_folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_folders" ADD CONSTRAINT "report_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_folders" ADD CONSTRAINT "report_folders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_preview_file_id_managed_files_id_fk" FOREIGN KEY ("preview_file_id") REFERENCES "public"."managed_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_templates" ADD CONSTRAINT "report_asset_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_usage_logs" ADD CONSTRAINT "report_asset_usage_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_asset_usage_logs" ADD CONSTRAINT "report_asset_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_messages" ADD CONSTRAINT "report_chatbi_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_messages" ADD CONSTRAINT "report_chatbi_messages_session_id_report_chatbi_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."report_chatbi_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_messages" ADD CONSTRAINT "report_chatbi_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_messages" ADD CONSTRAINT "report_chatbi_messages_saved_dataset_id_report_datasets_id_fk" FOREIGN KEY ("saved_dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_messages" ADD CONSTRAINT "report_chatbi_messages_saved_dashboard_id_report_dashboards_id_fk" FOREIGN KEY ("saved_dashboard_id") REFERENCES "public"."report_dashboards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_sessions" ADD CONSTRAINT "report_chatbi_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_sessions" ADD CONSTRAINT "report_chatbi_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_sessions" ADD CONSTRAINT "report_chatbi_sessions_datasource_id_report_datasources_id_fk" FOREIGN KEY ("datasource_id") REFERENCES "public"."report_datasources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_chatbi_sessions" ADD CONSTRAINT "report_chatbi_sessions_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_deprecation_notices" ADD CONSTRAINT "report_deprecation_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_deprecation_notices" ADD CONSTRAINT "report_deprecation_notices_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_deprecation_notices" ADD CONSTRAINT "report_deprecation_notices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_deprecation_notices" ADD CONSTRAINT "report_deprecation_notices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_rule_id_report_dq_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."report_dq_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_run_id_report_dq_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_dq_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_anomalies" ADD CONSTRAINT "report_dq_anomalies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_rules" ADD CONSTRAINT "report_dq_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_rules" ADD CONSTRAINT "report_dq_rules_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_rules" ADD CONSTRAINT "report_dq_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_rules" ADD CONSTRAINT "report_dq_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_runs" ADD CONSTRAINT "report_dq_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_runs" ADD CONSTRAINT "report_dq_runs_rule_id_report_dq_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."report_dq_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_runs" ADD CONSTRAINT "report_dq_runs_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_runs" ADD CONSTRAINT "report_dq_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_scores" ADD CONSTRAINT "report_dq_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dq_scores" ADD CONSTRAINT "report_dq_scores_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_source_environment_id_report_environments_id_fk" FOREIGN KEY ("source_environment_id") REFERENCES "public"."report_environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_target_environment_id_report_environments_id_fk" FOREIGN KEY ("target_environment_id") REFERENCES "public"."report_environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environment_promotions" ADD CONSTRAINT "report_environment_promotions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environments" ADD CONSTRAINT "report_environments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environments" ADD CONSTRAINT "report_environments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_environments" ADD CONSTRAINT "report_environments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_template_id_report_fill_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_fill_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_workflow_instance_id_workflow_instances_id_fk" FOREIGN KEY ("workflow_instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_generated_dataset_id_report_datasets_id_fk" FOREIGN KEY ("generated_dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_records" ADD CONSTRAINT "report_fill_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_generated_dataset_id_report_datasets_id_fk" FOREIGN KEY ("generated_dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_fill_templates" ADD CONSTRAINT "report_fill_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_materialization_snapshots" ADD CONSTRAINT "report_materialization_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_materialization_snapshots" ADD CONSTRAINT "report_materialization_snapshots_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_materialization_snapshots" ADD CONSTRAINT "report_materialization_snapshots_file_id_managed_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."managed_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_materialization_snapshots" ADD CONSTRAINT "report_materialization_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_materialization_snapshots" ADD CONSTRAINT "report_materialization_snapshots_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_deprecated_by_users_id_fk" FOREIGN KEY ("deprecated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_publish_approvals" ADD CONSTRAINT "report_publish_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_publish_approvals" ADD CONSTRAINT "report_publish_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_publish_approvals" ADD CONSTRAINT "report_publish_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_publish_approvals" ADD CONSTRAINT "report_publish_approvals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_publish_approvals" ADD CONSTRAINT "report_publish_approvals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_cost_logs" ADD CONSTRAINT "report_query_cost_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_cost_logs" ADD CONSTRAINT "report_query_cost_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_cost_logs" ADD CONSTRAINT "report_query_cost_logs_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_cost_logs" ADD CONSTRAINT "report_query_cost_logs_datasource_id_report_datasources_id_fk" FOREIGN KEY ("datasource_id") REFERENCES "public"."report_datasources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_quotas" ADD CONSTRAINT "report_query_quotas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_quotas" ADD CONSTRAINT "report_query_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_quotas" ADD CONSTRAINT "report_query_quotas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_query_quotas" ADD CONSTRAINT "report_query_quotas_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_acls" ADD CONSTRAINT "report_resource_acls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_acls" ADD CONSTRAINT "report_resource_acls_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_acls" ADD CONSTRAINT "report_resource_acls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_acls" ADD CONSTRAINT "report_resource_acls_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_from_owner_id_users_id_fk" FOREIGN KEY ("from_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_to_owner_id_users_id_fk" FOREIGN KEY ("to_owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resource_transfers" ADD CONSTRAINT "report_resource_transfers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_rules" ADD CONSTRAINT "report_sla_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_rules" ADD CONSTRAINT "report_sla_rules_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_rules" ADD CONSTRAINT "report_sla_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_rules" ADD CONSTRAINT "report_sla_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_violations" ADD CONSTRAINT "report_sla_violations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_violations" ADD CONSTRAINT "report_sla_violations_rule_id_report_sla_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."report_sla_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_violations" ADD CONSTRAINT "report_sla_violations_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_violations" ADD CONSTRAINT "report_sla_violations_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sla_violations" ADD CONSTRAINT "report_sla_violations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_folders_tenant_root_name_uq" ON "report_folders" USING btree ("tenant_id","resource_type","name") WHERE "report_folders"."tenant_id" is not null and "report_folders"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_folders_tenant_child_name_uq" ON "report_folders" USING btree ("tenant_id","parent_id","resource_type","name") WHERE "report_folders"."tenant_id" is not null and "report_folders"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_folders_global_root_name_uq" ON "report_folders" USING btree ("resource_type","name") WHERE "report_folders"."tenant_id" is null and "report_folders"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_folders_global_child_name_uq" ON "report_folders" USING btree ("parent_id","resource_type","name") WHERE "report_folders"."tenant_id" is null and "report_folders"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "report_folders_tenant_type_status_idx" ON "report_folders" USING btree ("tenant_id","resource_type","status");--> statement-breakpoint
CREATE INDEX "report_folders_parent_sort_idx" ON "report_folders" USING btree ("parent_id","sort");--> statement-breakpoint
CREATE INDEX "report_folders_owner_idx" ON "report_folders" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_asset_templates_tenant_code_uq" ON "report_asset_templates" USING btree ("tenant_id","code") WHERE "report_asset_templates"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_asset_templates_global_code_uq" ON "report_asset_templates" USING btree ("code") WHERE "report_asset_templates"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_asset_templates_tenant_type_status_idx" ON "report_asset_templates" USING btree ("tenant_id","type","status");--> statement-breakpoint
CREATE INDEX "report_asset_templates_folder_idx" ON "report_asset_templates" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_asset_templates_owner_idx" ON "report_asset_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "report_asset_usage_logs_resource_time_idx" ON "report_asset_usage_logs" USING btree ("tenant_id","resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "report_asset_usage_logs_user_time_idx" ON "report_asset_usage_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "report_chatbi_messages_session_time_idx" ON "report_chatbi_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "report_chatbi_messages_tenant_user_time_idx" ON "report_chatbi_messages" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "report_chatbi_sessions_user_status_time_idx" ON "report_chatbi_sessions" USING btree ("tenant_id","user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "report_chatbi_sessions_dataset_idx" ON "report_chatbi_sessions" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "report_chatbi_sessions_datasource_idx" ON "report_chatbi_sessions" USING btree ("datasource_id");--> statement-breakpoint
CREATE INDEX "report_deprecation_notices_resource_idx" ON "report_deprecation_notices" USING btree ("tenant_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "report_deprecation_notices_effective_idx" ON "report_deprecation_notices" USING btree ("tenant_id","effective_at","expires_at");--> statement-breakpoint
CREATE INDEX "report_dq_anomalies_dataset_status_idx" ON "report_dq_anomalies" USING btree ("dataset_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_dq_anomalies_tenant_severity_status_idx" ON "report_dq_anomalies" USING btree ("tenant_id","severity","status");--> statement-breakpoint
CREATE INDEX "report_dq_anomalies_run_idx" ON "report_dq_anomalies" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_dq_rules_tenant_dataset_name_uq" ON "report_dq_rules" USING btree ("tenant_id","dataset_id","name") WHERE "report_dq_rules"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_dq_rules_global_dataset_name_uq" ON "report_dq_rules" USING btree ("dataset_id","name") WHERE "report_dq_rules"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_dq_rules_dataset_enabled_idx" ON "report_dq_rules" USING btree ("dataset_id","enabled");--> statement-breakpoint
CREATE INDEX "report_dq_rules_schedule_idx" ON "report_dq_rules" USING btree ("enabled","cron");--> statement-breakpoint
CREATE INDEX "report_dq_runs_rule_time_idx" ON "report_dq_runs" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "report_dq_runs_dataset_status_time_idx" ON "report_dq_runs" USING btree ("dataset_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_dq_runs_tenant_time_idx" ON "report_dq_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "report_dq_scores_dataset_time_idx" ON "report_dq_scores" USING btree ("dataset_id","measured_at");--> statement-breakpoint
CREATE INDEX "report_dq_scores_tenant_time_idx" ON "report_dq_scores" USING btree ("tenant_id","measured_at");--> statement-breakpoint
CREATE INDEX "report_environment_promotions_resource_idx" ON "report_environment_promotions" USING btree ("tenant_id","resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "report_environment_promotions_target_status_idx" ON "report_environment_promotions" USING btree ("target_environment_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_environments_tenant_code_uq" ON "report_environments" USING btree ("tenant_id","code") WHERE "report_environments"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_environments_global_code_uq" ON "report_environments" USING btree ("code") WHERE "report_environments"."tenant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_environments_tenant_default_uq" ON "report_environments" USING btree ("tenant_id") WHERE "report_environments"."tenant_id" is not null and "report_environments"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "report_environments_global_default_uq" ON "report_environments" USING btree ("is_default") WHERE "report_environments"."tenant_id" is null and "report_environments"."is_default" = true;--> statement-breakpoint
CREATE INDEX "report_environments_tenant_kind_status_idx" ON "report_environments" USING btree ("tenant_id","kind","status");--> statement-breakpoint
CREATE INDEX "report_fill_records_template_status_time_idx" ON "report_fill_records" USING btree ("template_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_fill_records_submitter_status_time_idx" ON "report_fill_records" USING btree ("tenant_id","submitter_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_fill_records_workflow_idx" ON "report_fill_records" USING btree ("workflow_instance_id");--> statement-breakpoint
CREATE INDEX "report_fill_records_dataset_idx" ON "report_fill_records" USING btree ("generated_dataset_id");--> statement-breakpoint
CREATE INDEX "report_fill_records_sync_idx" ON "report_fill_records" USING btree ("tenant_id","sync_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_fill_templates_tenant_code_uq" ON "report_fill_templates" USING btree ("tenant_id","code") WHERE "report_fill_templates"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_fill_templates_global_code_uq" ON "report_fill_templates" USING btree ("code") WHERE "report_fill_templates"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_fill_templates_tenant_status_idx" ON "report_fill_templates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "report_fill_templates_folder_idx" ON "report_fill_templates" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_fill_templates_owner_idx" ON "report_fill_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "report_fill_templates_dataset_idx" ON "report_fill_templates" USING btree ("generated_dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_materialization_snapshots_dataset_revision_uq" ON "report_materialization_snapshots" USING btree ("dataset_id","revision");--> statement-breakpoint
CREATE INDEX "report_materialization_snapshots_dataset_status_idx" ON "report_materialization_snapshots" USING btree ("dataset_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_materialization_snapshots_tenant_expiry_idx" ON "report_materialization_snapshots" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_metrics_tenant_code_uq" ON "report_metrics" USING btree ("tenant_id","code") WHERE "report_metrics"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_metrics_global_code_uq" ON "report_metrics" USING btree ("code") WHERE "report_metrics"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_metrics_tenant_lifecycle_idx" ON "report_metrics" USING btree ("tenant_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "report_metrics_dataset_idx" ON "report_metrics" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "report_metrics_folder_idx" ON "report_metrics" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_metrics_owner_idx" ON "report_metrics" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "report_publish_approvals_resource_idx" ON "report_publish_approvals" USING btree ("tenant_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "report_publish_approvals_status_time_idx" ON "report_publish_approvals" USING btree ("tenant_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "report_publish_approvals_requester_idx" ON "report_publish_approvals" USING btree ("requested_by");--> statement-breakpoint
CREATE UNIQUE INDEX "report_query_cost_logs_request_uq" ON "report_query_cost_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "report_query_cost_logs_tenant_time_idx" ON "report_query_cost_logs" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "report_query_cost_logs_user_time_idx" ON "report_query_cost_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "report_query_cost_logs_dataset_time_idx" ON "report_query_cost_logs" USING btree ("dataset_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_query_quotas_tenant_scope_uq" ON "report_query_quotas" USING btree ("tenant_id","scope") WHERE "report_query_quotas"."tenant_id" is not null and "report_query_quotas"."scope" = 'tenant' and "report_query_quotas"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_query_quotas_global_scope_uq" ON "report_query_quotas" USING btree ("scope") WHERE "report_query_quotas"."tenant_id" is null and "report_query_quotas"."scope" = 'tenant' and "report_query_quotas"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_query_quotas_tenant_user_uq" ON "report_query_quotas" USING btree ("tenant_id","user_id") WHERE "report_query_quotas"."tenant_id" is not null and "report_query_quotas"."scope" = 'user' and "report_query_quotas"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_query_quotas_global_user_uq" ON "report_query_quotas" USING btree ("user_id") WHERE "report_query_quotas"."tenant_id" is null and "report_query_quotas"."scope" = 'user' and "report_query_quotas"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "report_query_quotas_enabled_idx" ON "report_query_quotas" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "report_resource_acls_tenant_subject_uq" ON "report_resource_acls" USING btree ("tenant_id","resource_type","resource_id","subject_type","subject_id","inherit_from_folder") WHERE "report_resource_acls"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_resource_acls_global_subject_uq" ON "report_resource_acls" USING btree ("resource_type","resource_id","subject_type","subject_id","inherit_from_folder") WHERE "report_resource_acls"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_resource_acls_resource_idx" ON "report_resource_acls" USING btree ("tenant_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "report_resource_acls_subject_idx" ON "report_resource_acls" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "report_resource_acls_expires_idx" ON "report_resource_acls" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "report_resource_transfers_resource_idx" ON "report_resource_transfers" USING btree ("tenant_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "report_resource_transfers_owner_status_idx" ON "report_resource_transfers" USING btree ("to_owner_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_sla_rules_tenant_dataset_name_uq" ON "report_sla_rules" USING btree ("tenant_id","dataset_id","name") WHERE "report_sla_rules"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_sla_rules_global_dataset_name_uq" ON "report_sla_rules" USING btree ("dataset_id","name") WHERE "report_sla_rules"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_sla_rules_dataset_enabled_idx" ON "report_sla_rules" USING btree ("dataset_id","enabled");--> statement-breakpoint
CREATE INDEX "report_sla_violations_rule_time_idx" ON "report_sla_violations" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "report_sla_violations_tenant_status_idx" ON "report_sla_violations" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
ALTER TABLE "report_dashboards" ADD CONSTRAINT "report_dashboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dashboards" ADD CONSTRAINT "report_dashboards_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD CONSTRAINT "report_datasets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD CONSTRAINT "report_datasets_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_datasources" ADD CONSTRAINT "report_datasources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_datasources" ADD CONSTRAINT "report_datasources_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_print_templates" ADD CONSTRAINT "report_print_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_print_templates" ADD CONSTRAINT "report_print_templates_folder_id_report_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_alert_rules_metric_idx" ON "report_alert_rules" USING btree ("metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_dashboards_tenant_name_uq" ON "report_dashboards" USING btree ("tenant_id","name") WHERE "report_dashboards"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_dashboards_global_name_uq" ON "report_dashboards" USING btree ("name") WHERE "report_dashboards"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_dashboards_tenant_lifecycle_idx" ON "report_dashboards" USING btree ("tenant_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "report_dashboards_folder_idx" ON "report_dashboards" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_dashboards_owner_idx" ON "report_dashboards" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_datasets_tenant_name_uq" ON "report_datasets" USING btree ("tenant_id","name") WHERE "report_datasets"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_datasets_global_name_uq" ON "report_datasets" USING btree ("name") WHERE "report_datasets"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_datasets_tenant_status_idx" ON "report_datasets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "report_datasets_folder_idx" ON "report_datasets" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_datasets_owner_idx" ON "report_datasets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_datasources_tenant_name_uq" ON "report_datasources" USING btree ("tenant_id","name") WHERE "report_datasources"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_datasources_global_name_uq" ON "report_datasources" USING btree ("name") WHERE "report_datasources"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_datasources_tenant_status_idx" ON "report_datasources" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "report_datasources_folder_idx" ON "report_datasources" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_datasources_owner_idx" ON "report_datasources" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_print_templates_tenant_name_uq" ON "report_print_templates" USING btree ("tenant_id","name") WHERE "report_print_templates"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_print_templates_global_name_uq" ON "report_print_templates" USING btree ("name") WHERE "report_print_templates"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "report_print_templates_tenant_status_idx" ON "report_print_templates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "report_print_templates_folder_idx" ON "report_print_templates" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "report_print_templates_owner_idx" ON "report_print_templates" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "report_alert_rules" ADD CONSTRAINT "report_alert_rules_source_check" CHECK (("report_alert_rules"."dataset_id" IS NOT NULL) <> ("report_alert_rules"."metric_id" IS NOT NULL));