CREATE TABLE "cms_editorial_note_replies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_editorial_note_replies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note_id" integer NOT NULL,
	"message" text NOT NULL,
	"mentioned_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_collection_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_content_collection_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_collections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_content_collections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(80) NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_editorial_notes" ADD COLUMN "anchor" jsonb;--> statement-breakpoint
ALTER TABLE "cms_editorial_notes" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
ALTER TABLE "cms_editorial_notes" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "cms_editorial_note_replies" ADD CONSTRAINT "cms_editorial_note_replies_note_id_cms_editorial_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."cms_editorial_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_note_replies" ADD CONSTRAINT "cms_editorial_note_replies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_note_replies" ADD CONSTRAINT "cms_editorial_note_replies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collection_versions" ADD CONSTRAINT "cms_content_collection_versions_collection_id_cms_content_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cms_content_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collection_versions" ADD CONSTRAINT "cms_content_collection_versions_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collection_versions" ADD CONSTRAINT "cms_content_collection_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collections" ADD CONSTRAINT "cms_content_collections_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collections" ADD CONSTRAINT "cms_content_collections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_collections" ADD CONSTRAINT "cms_content_collections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_editorial_note_replies_note_idx" ON "cms_editorial_note_replies" USING btree ("note_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_collection_versions_collection_version_uq" ON "cms_content_collection_versions" USING btree ("collection_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_content_collections_site_code_uq" ON "cms_content_collections" USING btree ("site_id","code");--> statement-breakpoint
ALTER TABLE "cms_editorial_notes" ADD CONSTRAINT "cms_editorial_notes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER cms_collection_versions_immutable BEFORE UPDATE ON cms_content_collection_versions FOR EACH ROW EXECUTE FUNCTION cms_immutable_revision();
