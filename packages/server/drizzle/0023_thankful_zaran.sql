CREATE TYPE "public"."cms_deployment_storage_state" AS ENUM('available', 'purging', 'purged');--> statement-breakpoint
CREATE TABLE "cms_deployment_retention_policies" (
	"site_id" integer PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"retain_count" integer DEFAULT 10 NOT NULL,
	"retain_days" integer DEFAULT 30 NOT NULL,
	"failed_retain_days" integer DEFAULT 7 NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_deployment_storage" (
	"deployment_id" integer PRIMARY KEY NOT NULL,
	"site_code" varchar(50),
	"version" integer DEFAULT 1 NOT NULL,
	"storage_state" "cms_deployment_storage_state" DEFAULT 'available' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"pin_reason" text,
	"schema_bytes" bigint,
	"file_bytes" bigint,
	"file_count" integer,
	"measured_at" timestamp with time zone,
	"cleanup_task_id" integer,
	"schema_purged_at" timestamp with time zone,
	"files_purged_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"error" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_deployment_retention_policies" ADD CONSTRAINT "cms_deployment_retention_policies_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_retention_policies" ADD CONSTRAINT "cms_deployment_retention_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_retention_policies" ADD CONSTRAINT "cms_deployment_retention_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_storage" ADD CONSTRAINT "cms_deployment_storage_deployment_id_cms_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."cms_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_storage" ADD CONSTRAINT "cms_deployment_storage_cleanup_task_id_async_tasks_id_fk" FOREIGN KEY ("cleanup_task_id") REFERENCES "public"."async_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_storage" ADD CONSTRAINT "cms_deployment_storage_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_deployment_storage" ADD CONSTRAINT "cms_deployment_storage_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_deployment_storage_state_idx" ON "cms_deployment_storage" USING btree ("storage_state");