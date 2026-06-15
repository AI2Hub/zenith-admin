CREATE TYPE "public"."payment_channel" AS ENUM('wechat', 'alipay');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('wechat_native', 'wechat_jsapi', 'wechat_h5', 'alipay_page', 'alipay_wap', 'alipay_app');--> statement-breakpoint
CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paying', 'success', 'closed', 'refunding', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_refund_status" AS ENUM('pending', 'processing', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "payment_channel_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sandbox" boolean DEFAULT false NOT NULL,
	"notify_url" varchar(512),
	"wechat_app_id" varchar(64),
	"wechat_mch_id" varchar(64),
	"wechat_api_v3_key_encrypted" text,
	"wechat_private_key_encrypted" text,
	"wechat_serial_no" varchar(128),
	"wechat_platform_cert" text,
	"alipay_app_id" varchar(64),
	"alipay_private_key_encrypted" text,
	"alipay_public_key" text,
	"alipay_sign_type" varchar(16) DEFAULT 'RSA2',
	"alipay_gateway" varchar(256),
	"remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_notify_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"scene" varchar(16) DEFAULT 'payment' NOT NULL,
	"order_no" varchar(64),
	"raw_body" text,
	"headers" text,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"result" varchar(32),
	"message" varchar(512),
	"ip" varchar(64),
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"out_trade_no" varchar(64) NOT NULL,
	"channel_trade_no" varchar(128),
	"biz_type" varchar(64) NOT NULL,
	"biz_id" varchar(128) NOT NULL,
	"subject" varchar(256) NOT NULL,
	"body" varchar(512),
	"amount" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"channel_config_id" integer,
	"pay_method" "payment_method" NOT NULL,
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"user_id" integer,
	"open_id" varchar(128),
	"client_ip" varchar(64),
	"department_id" integer,
	"paid_amount" integer,
	"paid_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"notify_data" text,
	"error_message" varchar(512),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "payment_orders_channel_out_trade_no_uq" UNIQUE("channel","out_trade_no")
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"refund_no" varchar(64) NOT NULL,
	"out_refund_no" varchar(64) NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"order_id" integer,
	"channel_refund_no" varchar(128),
	"channel" "payment_channel" NOT NULL,
	"refund_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"reason" varchar(256),
	"status" "payment_refund_status" DEFAULT 'pending' NOT NULL,
	"operator_id" integer,
	"refunded_at" timestamp with time zone,
	"notify_data" text,
	"error_message" varchar(512),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_refund_no_unique" UNIQUE("refund_no")
);
--> statement-breakpoint
ALTER TABLE "payment_channel_configs" ADD CONSTRAINT "payment_channel_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_channel_configs" ADD CONSTRAINT "payment_channel_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_channel_configs" ADD CONSTRAINT "payment_channel_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_notify_logs" ADD CONSTRAINT "payment_notify_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_channel_config_id_payment_channel_configs_id_fk" FOREIGN KEY ("channel_config_id") REFERENCES "public"."payment_channel_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_notify_logs_order_no_idx" ON "payment_notify_logs" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "payment_orders_biz_idx" ON "payment_orders" USING btree ("biz_type","biz_id");--> statement-breakpoint
CREATE INDEX "payment_orders_status_idx" ON "payment_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_orders_expired_idx" ON "payment_orders" USING btree ("expired_at");--> statement-breakpoint
CREATE INDEX "payment_refunds_order_no_idx" ON "payment_refunds" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds" USING btree ("status");