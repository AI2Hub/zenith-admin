CREATE TYPE "public"."async_task_item_status" AS ENUM('pending', 'success', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "async_task_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"item_key" varchar(128) NOT NULL,
	"label" varchar(256),
	"status" "async_task_item_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"data" jsonb,
	"attempt" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_async_task_item" UNIQUE("task_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "async_task_type_configs" (
	"task_type" varchar(64) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allow_concurrent" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"retry_delay_ms" integer DEFAULT 5000 NOT NULL,
	"retention_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "async_tasks" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "async_tasks" ADD COLUMN "next_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "async_tasks" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "async_task_items" ADD CONSTRAINT "async_task_items_task_id_async_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."async_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "async_task_items_task_idx" ON "async_task_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "async_task_items_task_status_idx" ON "async_task_items" USING btree ("task_id","status");--> statement-breakpoint
ALTER TABLE "async_tasks" ADD CONSTRAINT "uniq_async_tasks_idempotency_key" UNIQUE("idempotency_key");