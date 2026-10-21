CREATE TABLE "identity_access_grant_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_grant_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"grant_id" integer NOT NULL,
	"permission_code" varchar(128) NOT NULL,
	"permission_label" varchar(128),
	"status" "identity_access_grant_status" DEFAULT 'scheduled' NOT NULL,
	"scope_key" varchar(2048) NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_scope" "data_scope" DEFAULT 'self' NOT NULL,
	"dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"policy_snapshot" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" integer,
	"revoke_reason" varchar(1000),
	CONSTRAINT "identity_access_grant_items_permission_scope_unique" UNIQUE("grant_id","permission_code","scope_key")
);
--> statement-breakpoint
CREATE TABLE "identity_role_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_role_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role_id" integer NOT NULL,
	"version" integer NOT NULL,
	"permission_codes" jsonb NOT NULL,
	"data_scope" "data_scope" NOT NULL,
	"dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_role_versions_number_unique" UNIQUE("role_id","version")
);
--> statement-breakpoint
CREATE TABLE "identity_user_permissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_user_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"permission_code" varchar(128) NOT NULL,
	"data_scope" "data_scope" DEFAULT 'self' NOT NULL,
	"dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_key" varchar(2048) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_user_permissions_scope_unique" UNIQUE("user_id","permission_code","scope_key")
);
--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "identity_access_grant_menus" CASCADE;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" DROP CONSTRAINT "identity_access_request_items_menu_id_menus_id_fk";
--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ALTER COLUMN "item_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."identity_access_request_item_type";--> statement-breakpoint
CREATE TYPE "public"."identity_access_request_item_type" AS ENUM('role', 'permission');--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ALTER COLUMN "item_type" SET DATA TYPE "public"."identity_access_request_item_type" USING "item_type"::"public"."identity_access_request_item_type";--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "source_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."identity_access_review_source_type";--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_source_type" AS ENUM('role', 'group_membership', 'direct_permission', 'temporary_grant');--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "source_type" SET DATA TYPE "public"."identity_access_review_source_type" USING "source_type"::"public"."identity_access_review_source_type";--> statement-breakpoint
DROP INDEX "identity_access_request_items_menu_idx";--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ALTER COLUMN "permission_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "permission_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "permission_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ADD COLUMN "scope_key" varchar(2048) NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ADD COLUMN "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD COLUMN "permanent_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD COLUMN "emergency_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD COLUMN "max_emergency_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_items" ADD CONSTRAINT "identity_access_grant_items_grant_id_identity_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."identity_access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grant_items" ADD CONSTRAINT "identity_access_grant_items_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_role_versions" ADD CONSTRAINT "identity_role_versions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_role_versions" ADD CONSTRAINT "identity_role_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_role_versions" ADD CONSTRAINT "identity_role_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_user_permissions" ADD CONSTRAINT "identity_user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_user_permissions" ADD CONSTRAINT "identity_user_permissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_user_permissions" ADD CONSTRAINT "identity_user_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_access_grant_items_permission_idx" ON "identity_access_grant_items" USING btree ("permission_code");--> statement-breakpoint
CREATE INDEX "identity_access_grant_items_lifecycle_idx" ON "identity_access_grant_items" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "identity_access_request_items" DROP COLUMN "menu_id";