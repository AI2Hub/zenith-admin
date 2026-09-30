CREATE TABLE "cms_vocabularies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_vocabularies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(80) NOT NULL,
	"description" text,
	"model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"max_selections" integer DEFAULT 10 NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_component_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_component_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"component_id" integer NOT NULL,
	"version" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"component_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_components" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_site_id" integer,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_version_id" integer,
	"has_unpublished_changes" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_components_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "cms_model_unique_values" ALTER COLUMN "field" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "cms_tags" ADD COLUMN "vocabulary_id" integer;--> statement-breakpoint
ALTER TABLE "cms_tags" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "cms_tags" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_tags" ADD COLUMN "locale_labels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_vocabularies" ADD CONSTRAINT "cms_vocabularies_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_vocabularies" ADD CONSTRAINT "cms_vocabularies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_vocabularies" ADD CONSTRAINT "cms_vocabularies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_component_versions" ADD CONSTRAINT "cms_component_versions_component_id_cms_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."cms_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_component_versions" ADD CONSTRAINT "cms_component_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_component_versions" ADD CONSTRAINT "cms_component_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_components" ADD CONSTRAINT "cms_components_owner_site_id_cms_sites_id_fk" FOREIGN KEY ("owner_site_id") REFERENCES "public"."cms_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_components" ADD CONSTRAINT "cms_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_components" ADD CONSTRAINT "cms_components_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_vocabularies_site_code_uq" ON "cms_vocabularies" USING btree ("site_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_component_versions_component_version_uq" ON "cms_component_versions" USING btree ("component_id","version");--> statement-breakpoint
ALTER TABLE "cms_tags" ADD CONSTRAINT "cms_tags_vocabulary_id_cms_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."cms_vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_tags" ADD CONSTRAINT "cms_tags_parent_id_cms_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cms_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER cms_component_versions_immutable BEFORE UPDATE ON cms_component_versions FOR EACH ROW EXECUTE FUNCTION cms_immutable_revision();
