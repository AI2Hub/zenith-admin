CREATE TYPE "public"."user_behavior_event_type" AS ENUM('page_view', 'page_leave', 'feature_use', 'area_click');--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" varchar(64),
	"tenant_id" integer,
	"session_id" varchar(36),
	"event_type" "user_behavior_event_type" NOT NULL,
	"page_path" varchar(256) NOT NULL,
	"page_title" varchar(128),
	"element_key" varchar(128),
	"element_label" varchar(128),
	"component_area" varchar(64),
	"click_x" real,
	"click_y" real,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;