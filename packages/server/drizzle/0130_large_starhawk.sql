CREATE TYPE "public"."payment_link_status" AS ENUM('active', 'disabled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_scope" AS ENUM('global', 'channel', 'bizType');--> statement-breakpoint
CREATE TYPE "public"."payment_settlement_status" AS ENUM('pending', 'settling', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_sharing_order_status" AS ENUM('pending', 'processing', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_sharing_receiver_type" AS ENUM('merchant', 'personal');--> statement-breakpoint
CREATE TABLE "payment_fee_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"pay_method" "payment_method",
	"rate_bps" integer DEFAULT 0 NOT NULL,
	"fixed_fee" integer DEFAULT 0 NOT NULL,
	"min_fee" integer,
	"max_fee" integer,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_no" varchar(64) NOT NULL,
	"token" varchar(64) NOT NULL,
	"subject" varchar(256) NOT NULL,
	"amount" integer,
	"pay_method" "payment_method",
	"biz_type" varchar(64) NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expired_at" timestamp with time zone,
	"status" "payment_link_status" DEFAULT 'active' NOT NULL,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_link_no_unique" UNIQUE("link_no"),
	CONSTRAINT "payment_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payment_method_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" "payment_method" NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"label" varchar(64) NOT NULL,
	"icon" varchar(128),
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_method_configs_method_unique" UNIQUE("method")
);
--> statement-breakpoint
CREATE TABLE "payment_risk_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"scope" "payment_risk_scope" DEFAULT 'global' NOT NULL,
	"channel" "payment_channel",
	"biz_type" varchar(64),
	"single_limit" integer,
	"daily_limit" integer,
	"daily_count_limit" integer,
	"blocklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settlement_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_no" varchar(64) NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"period_start" varchar(10) NOT NULL,
	"period_end" varchar(10) NOT NULL,
	"status" "payment_settlement_status" DEFAULT 'pending' NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"gross_amount" integer DEFAULT 0 NOT NULL,
	"fee_amount" integer DEFAULT 0 NOT NULL,
	"refund_amount" integer DEFAULT 0 NOT NULL,
	"net_amount" integer DEFAULT 0 NOT NULL,
	"settled_at" timestamp with time zone,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settlement_batches_batch_no_unique" UNIQUE("batch_no")
);
--> statement-breakpoint
CREATE TABLE "payment_sharing_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"sharing_no" varchar(64) NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"receiver_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_sharing_order_status" DEFAULT 'pending' NOT NULL,
	"channel_sharing_no" varchar(128),
	"finished_at" timestamp with time zone,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_sharing_orders_sharing_no_unique" UNIQUE("sharing_no")
);
--> statement-breakpoint
CREATE TABLE "payment_sharing_receivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"receiver_type" "payment_sharing_receiver_type" DEFAULT 'merchant' NOT NULL,
	"account" varchar(128) NOT NULL,
	"ratio_bps" integer,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "fee_amount" integer;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "net_amount" integer;--> statement-breakpoint
ALTER TABLE "payment_fee_rules" ADD CONSTRAINT "payment_fee_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fee_rules" ADD CONSTRAINT "payment_fee_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fee_rules" ADD CONSTRAINT "payment_fee_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_configs" ADD CONSTRAINT "payment_method_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_configs" ADD CONSTRAINT "payment_method_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_configs" ADD CONSTRAINT "payment_method_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_rules" ADD CONSTRAINT "payment_risk_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_rules" ADD CONSTRAINT "payment_risk_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_rules" ADD CONSTRAINT "payment_risk_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_batches" ADD CONSTRAINT "payment_settlement_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_batches" ADD CONSTRAINT "payment_settlement_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_batches" ADD CONSTRAINT "payment_settlement_batches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_orders" ADD CONSTRAINT "payment_sharing_orders_receiver_id_payment_sharing_receivers_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."payment_sharing_receivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_orders" ADD CONSTRAINT "payment_sharing_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_orders" ADD CONSTRAINT "payment_sharing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_orders" ADD CONSTRAINT "payment_sharing_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_receivers" ADD CONSTRAINT "payment_sharing_receivers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_receivers" ADD CONSTRAINT "payment_sharing_receivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sharing_receivers" ADD CONSTRAINT "payment_sharing_receivers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_fee_rules_channel_idx" ON "payment_fee_rules" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "payment_risk_rules_scope_idx" ON "payment_risk_rules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "payment_settlement_batches_status_idx" ON "payment_settlement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_sharing_orders_order_no_idx" ON "payment_sharing_orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "payment_sharing_orders_receiver_idx" ON "payment_sharing_orders" USING btree ("receiver_id");