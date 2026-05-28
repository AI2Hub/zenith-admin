ALTER TYPE "public"."data_scope" ADD VALUE IF NOT EXISTS 'custom' BEFORE 'dept';--> statement-breakpoint
ALTER TYPE "public"."data_scope" ADD VALUE 'dept_only' BEFORE 'dept';
