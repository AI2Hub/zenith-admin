CREATE TABLE "mp_kf_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"kf_account" varchar(64) NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"avatar" varchar(512),
	"kf_id" varchar(64),
	"invite_status" varchar(32) DEFAULT 'none' NOT NULL,
	"invite_wx" varchar(64),
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mp_kf_accounts" ADD CONSTRAINT "mp_kf_accounts_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_kf_accounts" ADD CONSTRAINT "mp_kf_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_kf_accounts" ADD CONSTRAINT "mp_kf_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_kf_accounts" ADD CONSTRAINT "mp_kf_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mp_kf_accounts_account_kf_uq" ON "mp_kf_accounts" USING btree ("account_id","kf_account");--> statement-breakpoint
CREATE INDEX "mp_kf_accounts_account_idx" ON "mp_kf_accounts" USING btree ("account_id");