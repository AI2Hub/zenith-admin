ALTER TABLE "workflow_instances" ADD COLUMN "parent_task_item_key" varchar(128);--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD COLUMN "parent_task_item_index" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_instances_parent_task_item_key_idx" ON "workflow_instances" USING btree ("parent_task_id","parent_task_item_key");