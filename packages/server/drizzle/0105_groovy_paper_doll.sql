CREATE TYPE "public"."payment_event_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"payload" text NOT NULL,
	"status" "payment_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(512),
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_status_idx" ON "payment_events" USING btree ("status");