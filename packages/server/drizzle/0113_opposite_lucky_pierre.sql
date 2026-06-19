ALTER TABLE "workflow_tasks" ADD COLUMN "sub_total" integer;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD COLUMN "sub_done" integer DEFAULT 0 NOT NULL;