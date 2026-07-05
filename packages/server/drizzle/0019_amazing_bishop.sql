CREATE TYPE "public"."workflow_task_transfer_action" AS ENUM('transfer', 'delegate', 'reassign', 'handover', 'timeout');--> statement-breakpoint
CREATE TABLE "workflow_task_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"from_user_id" integer,
	"to_user_id" integer NOT NULL,
	"action" "workflow_task_transfer_action" NOT NULL,
	"reason" varchar(500),
	"operator_id" integer,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "workflow_job_executions_job_idx";--> statement-breakpoint
ALTER TABLE "workflow_event_subscriptions" ALTER COLUMN "events" SET DATA TYPE jsonb USING "events"::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_event_subscriptions" ALTER COLUMN "events" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_task_id_workflow_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."workflow_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_transfers" ADD CONSTRAINT "workflow_task_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wf_task_transfers_task_idx" ON "workflow_task_transfers" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "wf_task_transfers_instance_idx" ON "workflow_task_transfers" USING btree ("instance_id");--> statement-breakpoint
DELETE FROM "workflow_instance_migrations" WHERE "instance_id" NOT IN (SELECT "id" FROM "workflow_instances");--> statement-breakpoint
ALTER TABLE "workflow_instance_migrations" ADD CONSTRAINT "workflow_instance_migrations_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_definitions_tenant_status_idx" ON "workflow_definitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "workflow_tasks_instance_status_idx" ON "workflow_tasks" USING btree ("instance_id","status");--> statement-breakpoint
CREATE INDEX "workflow_job_executions_job_idx" ON "workflow_job_executions" USING btree ("job_id","attempt");--> statement-breakpoint
ALTER TABLE "workflow_data_sources" DROP COLUMN "headers";--> statement-breakpoint
ALTER TABLE "workflow_event_subscriptions" DROP COLUMN "secret";--> statement-breakpoint
ALTER TABLE "workflow_tasks" DROP COLUMN "transfer_chain";