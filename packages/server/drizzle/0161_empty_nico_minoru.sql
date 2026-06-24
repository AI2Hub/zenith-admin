ALTER TYPE "public"."mp_auto_reply_match" ADD VALUE 'regex';--> statement-breakpoint
CREATE TABLE "mp_unmatched_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"keyword" varchar(128) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_at" timestamp DEFAULT now() NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mp_auto_replies" ADD COLUMN "transfer_to_kf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mp_kf_sessions" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "mp_kf_sessions" ADD COLUMN "rating_remark" varchar(255);--> statement-breakpoint
ALTER TABLE "mp_qrcodes" ADD COLUMN "reward_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mp_unmatched_keywords" ADD CONSTRAINT "mp_unmatched_keywords_account_id_mp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mp_unmatched_keywords" ADD CONSTRAINT "mp_unmatched_keywords_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mp_unmatched_keywords_account_kw_uq" ON "mp_unmatched_keywords" USING btree ("account_id","keyword");