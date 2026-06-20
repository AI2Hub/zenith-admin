CREATE TYPE "public"."workflow_task_consult_status" AS ENUM('pending', 'replied', 'revoked');--> statement-breakpoint
ALTER TYPE "public"."workflow_node_type" ADD VALUE 'catchNode';--> statement-breakpoint
CREATE TABLE "workflow_task_consults" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"inviter_id" integer NOT NULL,
	"consultee_id" integer NOT NULL,
	"question" varchar(500),
	"opinion" text,
	"status" "workflow_task_consult_status" DEFAULT 'pending' NOT NULL,
	"replied_at" timestamp with time zone,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"code" varchar(64),
	"description" text,
	"category_name" varchar(64),
	"icon" varchar(64),
	"color" varchar(16),
	"flow_data" jsonb,
	"form_schema" jsonb,
	"sort" integer DEFAULT 0 NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_templates_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "workflow_task_consults" ADD CONSTRAINT "workflow_task_consults_task_id_workflow_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."workflow_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_consults" ADD CONSTRAINT "workflow_task_consults_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_consults" ADD CONSTRAINT "workflow_task_consults_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_consults" ADD CONSTRAINT "workflow_task_consults_consultee_id_users_id_fk" FOREIGN KEY ("consultee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_consults" ADD CONSTRAINT "workflow_task_consults_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;