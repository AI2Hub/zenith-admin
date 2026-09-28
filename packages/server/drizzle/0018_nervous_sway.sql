CREATE TYPE "public"."cms_media_processing_status" AS ENUM('pending', 'running', 'success', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "cms_media_processing" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_media_processing_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"asset_version_id" integer NOT NULL,
	"subtitle_version_id" integer,
	"task_id" integer,
	"status" "cms_media_processing_status" DEFAULT 'pending' NOT NULL,
	"focal_point" jsonb NOT NULL,
	"poster_time" real DEFAULT 0 NOT NULL,
	"subtitle_language" varchar(64) DEFAULT 'zh' NOT NULL,
	"subtitle_label" varchar(80) DEFAULT '中文字幕' NOT NULL,
	"result" jsonb,
	"error_message" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_contents" ADD COLUMN "media" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_media_processing" ADD CONSTRAINT "cms_media_processing_asset_version_id_cms_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."cms_asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media_processing" ADD CONSTRAINT "cms_media_processing_subtitle_version_id_cms_asset_versions_id_fk" FOREIGN KEY ("subtitle_version_id") REFERENCES "public"."cms_asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media_processing" ADD CONSTRAINT "cms_media_processing_task_id_async_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."async_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media_processing" ADD CONSTRAINT "cms_media_processing_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media_processing" ADD CONSTRAINT "cms_media_processing_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_media_processing_version_idx" ON "cms_media_processing" USING btree ("asset_version_id","id");--> statement-breakpoint
CREATE INDEX "cms_media_processing_task_idx" ON "cms_media_processing" USING btree ("task_id");
--> statement-breakpoint
-- Extend retained public projections with an empty media field until their next
-- publication. No historical media is inferred and immutable content is unchanged.
DO $$
DECLARE namespace record; definition text; has_media boolean;
BEGIN
  FOR namespace IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^cms_generation_[0-9]+$' LOOP
    IF to_regclass(format('%I.cms_content_projection', namespace.nspname)) IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=namespace.nspname AND table_name='cms_contents' AND column_name='media') INTO has_media;
      EXECUTE format('ALTER TABLE %I.cms_content_projection ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT %L::jsonb', namespace.nspname, '{}');
      IF NOT has_media AND to_regclass(format('%I.cms_contents', namespace.nspname)) IS NOT NULL THEN
        definition := regexp_replace(pg_get_viewdef(to_regclass(format('%I.cms_contents', namespace.nspname)), true), ';[[:space:]]*$', '');
        EXECUTE format('CREATE OR REPLACE VIEW %I.cms_contents AS SELECT previous.*, projection.media FROM (%s) previous JOIN %I.cms_content_projection projection ON projection.id=previous.id', namespace.nspname, definition, namespace.nspname);
      END IF;
    ELSIF to_regclass(format('%I.cms_contents', namespace.nspname)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.cms_contents ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT %L::jsonb', namespace.nspname, '{}');
    END IF;
  END LOOP;
END;
$$;
