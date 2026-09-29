CREATE TABLE "cms_telemetry_attributions" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"status" varchar(32) NOT NULL,
	"origin" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"next_recompute_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cms_collection_states" (
	"site_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"known_since" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_through" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_collection_transitions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_collection_transitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" varchar(40) NOT NULL,
	"deployment_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "cms_telemetry_outbox_pending_idx";--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "processed_rows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "total_rows" integer;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "replay_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "lease_owner" uuid;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD COLUMN "dead_letter_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_telemetry_attributions" ADD CONSTRAINT "cms_telemetry_attributions_event_id_user_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."user_events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_telemetry_attributions" ADD CONSTRAINT "cms_telemetry_attributions_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_states" ADD CONSTRAINT "cms_collection_states_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_collection_transitions" ADD CONSTRAINT "cms_collection_transitions_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_telemetry_attributions_due_idx" ON "cms_telemetry_attributions" USING btree ("next_recompute_at");--> statement-breakpoint
CREATE INDEX "cms_telemetry_attributions_site_idx" ON "cms_telemetry_attributions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "cms_collection_transitions_site_created_idx" ON "cms_collection_transitions" USING btree ("site_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cms_telemetry_outbox_pending_idx" ON "cms_telemetry_outbox" USING btree ("delivered_at","dead_letter_at","next_attempt_at","id");