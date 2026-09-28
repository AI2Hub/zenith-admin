CREATE TABLE "cms_telemetry_outbox" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_telemetry_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_telemetry_outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "cms_telemetry_receipts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_telemetry_receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_telemetry_outbox" ADD CONSTRAINT "cms_telemetry_outbox_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_telemetry_receipts" ADD CONSTRAINT "cms_telemetry_receipts_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_telemetry_outbox_pending_idx" ON "cms_telemetry_outbox" USING btree ("delivered_at","id");--> statement-breakpoint
CREATE INDEX "cms_telemetry_receipts_site_created_idx" ON "cms_telemetry_receipts" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "user_events_cms_site_created_idx" ON "user_events" USING btree (("properties"->>'cmsSiteId'),"created_at") WHERE "user_events"."properties" @> '{"cmsSchemaVersion":2,"trustedCms":true}'::jsonb;--> statement-breakpoint
CREATE INDEX "user_events_cms_page_created_idx" ON "user_events" USING btree (("properties"->>'pageViewId'),"created_at") WHERE "user_events"."properties" @> '{"cmsSchemaVersion":2,"trustedCms":true}'::jsonb;
--> statement-breakpoint
-- The v2 content counter projects verified page-view events only. Old request/IP counters are not carried forward.
UPDATE cms_contents SET view_count=0;
