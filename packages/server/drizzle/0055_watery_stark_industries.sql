CREATE TABLE "payment_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"pending_settle" integer DEFAULT 0 NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"frozen" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_channel_tenant_uq" ON "payment_accounts" USING btree ("channel","tenant_id") WHERE "payment_accounts"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_channel_global_uq" ON "payment_accounts" USING btree ("channel") WHERE "payment_accounts"."tenant_id" is null;