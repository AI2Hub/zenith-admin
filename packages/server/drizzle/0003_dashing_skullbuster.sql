CREATE TYPE "public"."payment_event_attempt_status" AS ENUM('processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "payment_event_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_event_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" integer NOT NULL,
	"generation" integer NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" "payment_event_attempt_status" DEFAULT 'processing' NOT NULL,
	"error_message" varchar(512),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "redispatch_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_event_attempts" ADD CONSTRAINT "payment_event_attempts_event_id_payment_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."payment_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_attempts_event_generation_attempt_uq" ON "payment_event_attempts" USING btree ("event_id","generation","attempt_no");--> statement-breakpoint
CREATE INDEX "payment_event_attempts_event_idx" ON "payment_event_attempts" USING btree ("event_id","id");--> statement-breakpoint
UPDATE "payment_events" SET "last_error" = NULL WHERE "status" = 'done';
