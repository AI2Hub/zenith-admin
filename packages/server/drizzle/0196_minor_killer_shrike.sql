CREATE TABLE "workflow_compensations" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"node_key" varchar(64) NOT NULL,
	"node_name" varchar(64),
	"error_message" varchar(1024),
	"action" varchar(16) DEFAULT 'notify' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_compensations" ADD CONSTRAINT "workflow_compensations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_compensations" ADD CONSTRAINT "workflow_compensations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wf_compensation_instance_idx" ON "workflow_compensations" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "wf_compensation_status_idx" ON "workflow_compensations" USING btree ("status");