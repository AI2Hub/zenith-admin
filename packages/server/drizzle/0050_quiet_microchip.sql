ALTER TABLE "workflow_definition_versions" ADD COLUMN "form_schema" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD COLUMN "activation_id" varchar(36);--> statement-breakpoint
CREATE INDEX "workflow_instances_tenant_status_idx" ON "workflow_instances" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "workflow_instances_initiator_status_idx" ON "workflow_instances" USING btree ("initiator_id","status");--> statement-breakpoint
CREATE INDEX "workflow_tasks_assignee_status_idx" ON "workflow_tasks" USING btree ("assignee_id","status");