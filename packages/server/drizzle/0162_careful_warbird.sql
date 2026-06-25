CREATE TYPE "public"."biz_pay_demo_status" AS ENUM('pending', 'paying', 'paid', 'closed');--> statement-breakpoint
CREATE TABLE "biz_pay_demos" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" varchar(128) NOT NULL,
	"amount" integer NOT NULL,
	"pay_method" varchar(32),
	"status" "biz_pay_demo_status" DEFAULT 'pending' NOT NULL,
	"payment_order_no" varchar(64),
	"paid_at" timestamp with time zone,
	"fulfill_remark" varchar(255),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biz_pay_demos" ADD CONSTRAINT "biz_pay_demos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_pay_demos" ADD CONSTRAINT "biz_pay_demos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_pay_demos" ADD CONSTRAINT "biz_pay_demos_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;