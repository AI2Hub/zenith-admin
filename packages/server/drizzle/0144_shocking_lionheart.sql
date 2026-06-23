CREATE TYPE "public"."mp_draft_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."mp_material_type" AS ENUM('image', 'voice', 'video', 'thumb');--> statement-breakpoint
CREATE TYPE "public"."mp_template_send_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TABLE "mp_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"articles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wechat_media_id" varchar(128),
	"status" "mp_draft_status" DEFAULT 'draft' NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"type" "mp_material_type" DEFAULT 'image' NOT NULL,
	"name" varchar(200) NOT NULL,
	"wechat_media_id" varchar(128),
	"url" varchar(1000),
	"file_size" integer,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"template_id" varchar(128) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"example" text,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mp_template_send_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"template_id" varchar(128) NOT NULL,
	"openid" varchar(64) NOT NULL,
	"data" jsonb,
	"url" varchar(1000),
	"status" "mp_template_send_status" DEFAULT 'success' NOT NULL,
	"error_msg" text,
	"msg_id" varchar(64),
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mp_drafts" ADD CONSTRAINT "mp_drafts_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_drafts" ADD CONSTRAINT "mp_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_drafts" ADD CONSTRAINT "mp_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_drafts" ADD CONSTRAINT "mp_drafts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_materials" ADD CONSTRAINT "mp_materials_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_materials" ADD CONSTRAINT "mp_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_materials" ADD CONSTRAINT "mp_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_materials" ADD CONSTRAINT "mp_materials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_message_templates" ADD CONSTRAINT "mp_message_templates_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_message_templates" ADD CONSTRAINT "mp_message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_message_templates" ADD CONSTRAINT "mp_message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_message_templates" ADD CONSTRAINT "mp_message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_template_send_logs" ADD CONSTRAINT "mp_template_send_logs_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_template_send_logs" ADD CONSTRAINT "mp_template_send_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mp_drafts_account_idx" ON "mp_drafts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "mp_materials_account_type_idx" ON "mp_materials" USING btree ("account_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "mp_message_templates_account_tpl_uq" ON "mp_message_templates" USING btree ("account_id","template_id");--> statement-breakpoint
CREATE INDEX "mp_template_send_logs_account_idx" ON "mp_template_send_logs" USING btree ("account_id");