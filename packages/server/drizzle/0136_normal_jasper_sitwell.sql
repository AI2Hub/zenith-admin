CREATE TYPE "public"."biz_leave_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."workflow_form_type" ADD VALUE 'external';--> statement-breakpoint
CREATE TABLE "biz_leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_type" varchar(32) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"days" real DEFAULT 1 NOT NULL,
	"reason" text,
	"status" "biz_leave_status" DEFAULT 'draft' NOT NULL,
	"workflow_instance_id" integer,
	"workflow_status" varchar(16),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD COLUMN "biz_type" varchar(64);--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD COLUMN "biz_id" varchar(64);--> statement-breakpoint
ALTER TABLE "biz_leaves" ADD CONSTRAINT "biz_leaves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_leaves" ADD CONSTRAINT "biz_leaves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_leaves" ADD CONSTRAINT "biz_leaves_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_instances_biz_idx" ON "workflow_instances" USING btree ("biz_type","biz_id");