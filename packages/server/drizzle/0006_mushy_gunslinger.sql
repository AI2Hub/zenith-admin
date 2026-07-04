CREATE TYPE "public"."payment_transfer_status" AS ENUM('pending', 'processing', 'success', 'failed');--> statement-breakpoint
ALTER TYPE "public"."payment_ledger_type" ADD VALUE 'transfer';--> statement-breakpoint
CREATE TABLE "payment_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_no" varchar(64) NOT NULL,
	"out_transfer_no" varchar(64) NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"channel_config_id" integer,
	"receiver_account" varchar(128) NOT NULL,
	"receiver_name" varchar(64),
	"amount" integer NOT NULL,
	"remark" varchar(256),
	"status" "payment_transfer_status" DEFAULT 'pending' NOT NULL,
	"channel_transfer_no" varchar(128),
	"fail_reason" varchar(512),
	"attempts" integer DEFAULT 0 NOT NULL,
	"biz_type" varchar(64),
	"biz_id" varchar(128),
	"finished_at" timestamp with time zone,
	"operator_id" integer,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transfers_transfer_no_unique" UNIQUE("transfer_no"),
	CONSTRAINT "payment_transfers_channel_out_no_uq" UNIQUE("channel","out_transfer_no")
);
--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_channel_config_id_payment_channel_configs_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "public"."payment_channel_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transfers_status_idx" ON "payment_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_transfers_biz_idx" ON "payment_transfers" USING btree ("biz_type","biz_id");