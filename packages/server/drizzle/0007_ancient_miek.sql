CREATE TYPE "public"."identity_access_approval_policy" AS ENUM('none', 'manager', 'manager_security', 'two_person');--> statement-breakpoint
CREATE TYPE "public"."identity_access_grant_source" AS ENUM('request', 'emergency', 'admin');--> statement-breakpoint
CREATE TYPE "public"."identity_access_grant_status" AS ENUM('scheduled', 'active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."identity_access_request_item_type" AS ENUM('role', 'menu');--> statement-breakpoint
CREATE TYPE "public"."identity_access_request_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'cancelled', 'applied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."identity_access_request_type" AS ENUM('temporary', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_decision" AS ENUM('pending', 'keep', 'revoke', 'extend', 'exception', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_scope_type" AS ENUM('tenant', 'department', 'role', 'group', 'high_risk', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_source_type" AS ENUM('role', 'group_role', 'direct_menu', 'temporary_grant');--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_status" AS ENUM('open', 'in_progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."identity_access_risk_level" AS ENUM('low', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "identity_access_grant_menus" (
	"grant_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	"permission_code" varchar(128),
	"permission_label" varchar(128),
	CONSTRAINT "identity_access_grant_menus_grant_id_menu_id_pk" PRIMARY KEY("grant_id","menu_id")
);
--> statement-breakpoint
CREATE TABLE "identity_access_grants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_grants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer,
	"user_id" integer NOT NULL,
	"request_id" integer,
	"source_type" "identity_access_grant_source" DEFAULT 'request' NOT NULL,
	"source_role_id" integer,
	"status" "identity_access_grant_status" DEFAULT 'scheduled' NOT NULL,
	"risk_level" "identity_access_risk_level" DEFAULT 'low' NOT NULL,
	"data_scope" "data_scope",
	"dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"revoked_by" integer,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(1000),
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_access_request_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_request_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"request_id" integer NOT NULL,
	"item_type" "identity_access_request_item_type" NOT NULL,
	"role_id" integer,
	"menu_id" integer,
	"permission_code" varchar(128),
	"permission_label" varchar(128),
	"data_scope" "data_scope",
	"dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_access_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer,
	"applicant_user_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"request_type" "identity_access_request_type" DEFAULT 'temporary' NOT NULL,
	"status" "identity_access_request_status" DEFAULT 'draft' NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"business_reference" varchar(128),
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"risk_level" "identity_access_risk_level" DEFAULT 'low' NOT NULL,
	"workflow_instance_id" integer,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"failure_reason" varchar(1000),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_access_review_campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_review_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer,
	"name" varchar(128) NOT NULL,
	"scope_type" "identity_access_review_scope_type" NOT NULL,
	"reviewer_id" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "identity_access_review_status" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_access_review_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_review_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"tenant_id" integer,
	"user_id" integer NOT NULL,
	"source_type" "identity_access_review_source_type" NOT NULL,
	"source_id" integer,
	"source_label" varchar(128),
	"permission_code" varchar(128),
	"permission_label" varchar(128),
	"risk_level" "identity_access_risk_level" DEFAULT 'low' NOT NULL,
	"decision" "identity_access_review_decision" DEFAULT 'pending' NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"remark" varchar(1000),
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_permission_policies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "identity_permission_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"permission_code" varchar(128) NOT NULL,
	"risk_level" "identity_access_risk_level" DEFAULT 'low' NOT NULL,
	"approval_policy" "identity_access_approval_policy" DEFAULT 'none' NOT NULL,
	"max_duration_minutes" integer,
	"review_interval_days" integer DEFAULT 0 NOT NULL,
	"mfa_required" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_permission_policies_code_tenant_unique" UNIQUE NULLS NOT DISTINCT("permission_code","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD CONSTRAINT "identity_access_grant_menus_grant_id_identity_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."identity_access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD CONSTRAINT "identity_access_grant_menus_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_request_id_identity_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."identity_access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_source_role_id_roles_id_fk" FOREIGN KEY ("source_role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ADD CONSTRAINT "identity_access_request_items_request_id_identity_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."identity_access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ADD CONSTRAINT "identity_access_request_items_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_request_items" ADD CONSTRAINT "identity_access_request_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_workflow_instance_id_workflow_instances_id_fk" FOREIGN KEY ("workflow_instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD CONSTRAINT "identity_access_review_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD CONSTRAINT "identity_access_review_campaigns_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD CONSTRAINT "identity_access_review_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD CONSTRAINT "identity_access_review_campaigns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_campaign_id_identity_access_review_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."identity_access_review_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD CONSTRAINT "identity_permission_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD CONSTRAINT "identity_permission_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD CONSTRAINT "identity_permission_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_access_grant_menus_menu_idx" ON "identity_access_grant_menus" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "identity_access_grants_tenant_status_idx" ON "identity_access_grants" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "identity_access_grants_user_status_idx" ON "identity_access_grants" USING btree ("user_id","status","starts_at","expires_at");--> statement-breakpoint
CREATE INDEX "identity_access_grants_request_idx" ON "identity_access_grants" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "identity_access_grants_expiry_idx" ON "identity_access_grants" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "identity_access_request_items_request_idx" ON "identity_access_request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "identity_access_request_items_role_idx" ON "identity_access_request_items" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "identity_access_request_items_menu_idx" ON "identity_access_request_items" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "identity_access_requests_tenant_created_idx" ON "identity_access_requests" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "identity_access_requests_applicant_idx" ON "identity_access_requests" USING btree ("applicant_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "identity_access_requests_target_idx" ON "identity_access_requests" USING btree ("target_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "identity_access_requests_status_idx" ON "identity_access_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "identity_access_requests_workflow_idx" ON "identity_access_requests" USING btree ("workflow_instance_id");--> statement-breakpoint
CREATE INDEX "identity_access_review_campaigns_tenant_status_idx" ON "identity_access_review_campaigns" USING btree ("tenant_id","status","due_at");--> statement-breakpoint
CREATE INDEX "identity_access_review_campaigns_reviewer_idx" ON "identity_access_review_campaigns" USING btree ("reviewer_id","status");--> statement-breakpoint
CREATE INDEX "identity_access_review_items_campaign_idx" ON "identity_access_review_items" USING btree ("campaign_id","decision");--> statement-breakpoint
CREATE INDEX "identity_access_review_items_tenant_user_idx" ON "identity_access_review_items" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "identity_access_review_items_risk_idx" ON "identity_access_review_items" USING btree ("risk_level","decision");--> statement-breakpoint
CREATE INDEX "identity_permission_policies_tenant_idx" ON "identity_permission_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "identity_permission_policies_risk_idx" ON "identity_permission_policies" USING btree ("risk_level");