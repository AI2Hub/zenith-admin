ALTER TYPE "public"."workflow_approve_method" ADD VALUE 'ratio';--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD COLUMN "approve_ratio" integer;