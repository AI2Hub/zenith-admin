CREATE TYPE "public"."impersonation_end_reason" AS ENUM('manual', 'expired', 'forced');--> statement-breakpoint
ALTER TYPE "public"."login_event_type" ADD VALUE 'impersonate';--> statement-breakpoint
ALTER TYPE "public"."login_event_type" ADD VALUE 'impersonate_end';--> statement-breakpoint
CREATE TABLE "impersonation_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "impersonation_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"impersonator_id" integer NOT NULL,
	"impersonator_name" varchar(64) NOT NULL,
	"target_user_id" integer NOT NULL,
	"target_username" varchar(64) NOT NULL,
	"tenant_id" integer,
	"token_id" varchar(64) NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"reason" varchar(256) NOT NULL,
	"ip" varchar(64),
	"location" varchar(128),
	"browser" varchar(64),
	"os" varchar(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" "impersonation_end_reason",
	"ended_by" integer
);
--> statement-breakpoint
ALTER TABLE "operation_logs" ADD COLUMN "impersonator_id" integer;--> statement-breakpoint
ALTER TABLE "operation_logs" ADD COLUMN "impersonator_name" varchar(32);--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_impersonator_id_users_id_fk" FOREIGN KEY ("impersonator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "impersonation_sessions_token_uq" ON "impersonation_sessions" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_impersonator_idx" ON "impersonation_sessions" USING btree ("impersonator_id");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_target_idx" ON "impersonation_sessions" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_tenant_started_idx" ON "impersonation_sessions" USING btree ("tenant_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "impersonation_sessions_started_idx" ON "impersonation_sessions" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operation_logs_impersonator_idx" ON "operation_logs" USING btree ("impersonator_id");