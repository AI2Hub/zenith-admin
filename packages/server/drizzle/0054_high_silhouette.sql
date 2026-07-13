CREATE TYPE "public"."payment_risk_action" AS ENUM('block', 'review');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_dimension" AS ENUM('blocklist', 'single_limit', 'daily_limit', 'daily_count');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "payment_risk_hits" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer,
	"rule_name" varchar(64) NOT NULL,
	"action" "payment_risk_action" NOT NULL,
	"dimension" "payment_risk_dimension" NOT NULL,
	"dimension_value" varchar(256),
	"channel" "payment_channel" NOT NULL,
	"biz_type" varchar(64) NOT NULL,
	"biz_id" varchar(128) NOT NULL,
	"order_no" varchar(64),
	"amount" integer NOT NULL,
	"open_id" varchar(128),
	"user_id" integer,
	"client_ip" varchar(64),
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_risk_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_no" varchar(64) NOT NULL,
	"hit_id" integer,
	"order_no" varchar(64) NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"biz_type" varchar(64) NOT NULL,
	"biz_id" varchar(128) NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(256) NOT NULL,
	"status" "payment_risk_review_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" integer,
	"reviewed_at" timestamp with time zone,
	"review_remark" varchar(256),
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_risk_reviews_review_no_unique" UNIQUE("review_no")
);
--> statement-breakpoint
ALTER TABLE "payment_risk_rules" ADD COLUMN "allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_risk_rules" ADD COLUMN "action" "payment_risk_action" DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_risk_hits" ADD CONSTRAINT "payment_risk_hits_rule_id_payment_risk_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."payment_risk_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_hits" ADD CONSTRAINT "payment_risk_hits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_hits" ADD CONSTRAINT "payment_risk_hits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_reviews" ADD CONSTRAINT "payment_risk_reviews_hit_id_payment_risk_hits_id_fk" FOREIGN KEY ("hit_id") REFERENCES "public"."payment_risk_hits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_reviews" ADD CONSTRAINT "payment_risk_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_reviews" ADD CONSTRAINT "payment_risk_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_reviews" ADD CONSTRAINT "payment_risk_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_reviews" ADD CONSTRAINT "payment_risk_reviews_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_risk_hits_created_idx" ON "payment_risk_hits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_risk_hits_rule_idx" ON "payment_risk_hits" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_risk_reviews_pending_order_uq" ON "payment_risk_reviews" USING btree ("order_no") WHERE "payment_risk_reviews"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_risk_reviews_status_idx" ON "payment_risk_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_risk_reviews_biz_idx" ON "payment_risk_reviews" USING btree ("biz_type","biz_id");