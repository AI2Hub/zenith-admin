CREATE TABLE "mp_conditional_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"menu_id" varchar(64),
	"status" "mp_menu_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mp_accounts" ADD COLUMN "content_check_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mp_fans" ADD COLUMN "blacklisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mp_conditional_menus" ADD CONSTRAINT "mp_conditional_menus_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_conditional_menus" ADD CONSTRAINT "mp_conditional_menus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_conditional_menus" ADD CONSTRAINT "mp_conditional_menus_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_conditional_menus" ADD CONSTRAINT "mp_conditional_menus_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mp_conditional_menus_account_idx" ON "mp_conditional_menus" USING btree ("account_id");