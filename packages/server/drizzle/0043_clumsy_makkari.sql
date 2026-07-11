CREATE TYPE "public"."analytics_event_override_status" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."analytics_event_quality_issue_type" AS ENUM('missing_required', 'type_mismatch', 'invalid_enum', 'event_disabled');--> statement-breakpoint
CREATE TYPE "public"."analytics_event_source" AS ENUM('web_admin', 'web_member', 'server');--> statement-breakpoint
CREATE TYPE "public"."analytics_identity_type" AS ENUM('admin', 'member', 'anonymous');--> statement-breakpoint
CREATE TABLE "analytics_event_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"event_name" varchar(128) NOT NULL,
	"status" "analytics_event_override_status" DEFAULT 'enabled' NOT NULL,
	"reason" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_event_quality_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"stat_date" date NOT NULL,
	"event_name" varchar(128) NOT NULL,
	"issue_type" "analytics_event_quality_issue_type" NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"sample" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_segment_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"segment_id" integer NOT NULL,
	"tenant_id" integer,
	"distinct_id" varchar(64) NOT NULL,
	"identity_type" "analytics_identity_type" DEFAULT 'anonymous' NOT NULL,
	"user_id" integer,
	"member_id" integer,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"distinct_id" varchar(64) NOT NULL,
	"identity_type" "analytics_identity_type" DEFAULT 'anonymous' NOT NULL,
	"user_id" integer,
	"member_id" integer,
	"display_name" varchar(64),
	"properties" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_user_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"name" varchar(128) NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"status" "analytics_event_override_status" DEFAULT 'enabled' NOT NULL,
	"estimated_size" integer DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_event_meta" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_event_meta" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "analytics_event_meta" ADD COLUMN "owner_name" varchar(64);--> statement-breakpoint
ALTER TABLE "analytics_event_meta" ADD COLUMN "strict_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "source" "analytics_event_source" DEFAULT 'web_admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "app_id" varchar(64) DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "environment" varchar(32) DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "source" "analytics_event_source" DEFAULT 'web_admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "app_id" varchar(64) DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "environment" varchar(32) DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "error_events" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "source" "analytics_event_source" DEFAULT 'web_admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "app_id" varchar(64) DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "environment" varchar(32) DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "sdk_version" varchar(32);--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "analytics_event_overrides" ADD CONSTRAINT "analytics_event_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event_overrides" ADD CONSTRAINT "analytics_event_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event_overrides" ADD CONSTRAINT "analytics_event_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_segment_members" ADD CONSTRAINT "analytics_segment_members_segment_id_analytics_user_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."analytics_user_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_segment_members" ADD CONSTRAINT "analytics_segment_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_user_profiles" ADD CONSTRAINT "analytics_user_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_user_segments" ADD CONSTRAINT "analytics_user_segments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_user_segments" ADD CONSTRAINT "analytics_user_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_user_segments" ADD CONSTRAINT "analytics_user_segments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_event_overrides_tenant_name_uq" ON "analytics_event_overrides" USING btree ("tenant_id","event_name");--> statement-breakpoint
CREATE INDEX "analytics_event_overrides_status_idx" ON "analytics_event_overrides" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_event_quality_daily_uq" ON "analytics_event_quality_daily" USING btree ("tenant_id","stat_date","event_name","issue_type");--> statement-breakpoint
CREATE INDEX "analytics_event_quality_daily_date_idx" ON "analytics_event_quality_daily" USING btree ("stat_date");--> statement-breakpoint
CREATE INDEX "analytics_event_quality_daily_tenant_idx" ON "analytics_event_quality_daily" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_segment_members_segment_distinct_uq" ON "analytics_segment_members" USING btree ("segment_id","distinct_id");--> statement-breakpoint
CREATE INDEX "analytics_segment_members_segment_idx" ON "analytics_segment_members" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "analytics_segment_members_tenant_idx" ON "analytics_segment_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "analytics_segment_members_member_idx" ON "analytics_segment_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_user_profiles_tenant_distinct_uq" ON "analytics_user_profiles" USING btree (coalesce("tenant_id", 0),"distinct_id");--> statement-breakpoint
CREATE INDEX "analytics_user_profiles_user_idx" ON "analytics_user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_user_profiles_member_idx" ON "analytics_user_profiles" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "analytics_user_profiles_last_seen_idx" ON "analytics_user_profiles" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_user_segments_tenant_name_uq" ON "analytics_user_segments" USING btree ("tenant_id","name") WHERE "analytics_user_segments"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_user_segments_global_name_uq" ON "analytics_user_segments" USING btree ("name") WHERE "analytics_user_segments"."tenant_id" is null;--> statement-breakpoint
CREATE INDEX "analytics_user_segments_tenant_status_idx" ON "analytics_user_segments" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "analytics_event_meta" ADD CONSTRAINT "analytics_event_meta_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_event_meta_owner_idx" ON "analytics_event_meta" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_sessions_member_idx" ON "analytics_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "analytics_sessions_tenant_started_idx" ON "analytics_sessions" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "error_events_member_idx" ON "error_events" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "user_events_member_idx" ON "user_events" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "user_events_tenant_created_name_idx" ON "user_events" USING btree ("tenant_id","created_at","event_name");--> statement-breakpoint
CREATE INDEX "user_events_source_created_idx" ON "user_events" USING btree ("source","created_at");