ALTER TYPE "public"."cms_resource_owner_type" ADD VALUE 'page_preset_version';--> statement-breakpoint
CREATE TABLE "cms_page_preset_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_page_preset_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"preset_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"blocks" jsonb NOT NULL,
	"parameters" jsonb NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_page_presets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_page_presets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"current_version" integer DEFAULT 1 NOT NULL,
	"block_count" integer NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_page_preset_versions" ADD CONSTRAINT "cms_page_preset_versions_preset_id_cms_page_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."cms_page_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_page_preset_versions" ADD CONSTRAINT "cms_page_preset_versions_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_page_presets" ADD CONSTRAINT "cms_page_presets_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_page_presets" ADD CONSTRAINT "cms_page_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_page_presets" ADD CONSTRAINT "cms_page_presets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_page_preset_versions_preset_version_uq" ON "cms_page_preset_versions" USING btree ("preset_id","version");--> statement-breakpoint
CREATE INDEX "cms_page_preset_versions_site_idx" ON "cms_page_preset_versions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "cms_page_presets_site_idx" ON "cms_page_presets" USING btree ("site_id");
--> statement-breakpoint
CREATE TRIGGER cms_page_preset_versions_immutable BEFORE UPDATE ON cms_page_preset_versions FOR EACH ROW EXECUTE FUNCTION cms_immutable_revision();
