CREATE TYPE "public"."identity_access_provision_status" AS ENUM('not_started', 'pending', 'running', 'succeeded', 'failed', 'terminated');--> statement-breakpoint
ALTER TYPE "public"."identity_access_review_scope_type" ADD VALUE 'user' BEFORE 'high_risk';--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."identity_access_review_status";--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_status" AS ENUM('preparing', 'open', 'in_progress', 'completed', 'overdue', 'failed');--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ALTER COLUMN "status" SET DATA TYPE "public"."identity_access_review_status" USING "status"::"public"."identity_access_review_status";--> statement-breakpoint
ALTER TYPE "public"."workflow_job_type" ADD VALUE 'access_review_build';--> statement-breakpoint
ALTER TABLE "identity_access_grants" DROP CONSTRAINT "identity_access_grants_source_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD COLUMN "provision_status" "identity_access_provision_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
UPDATE "identity_access_requests" SET "provision_status" = CASE "status"::text
  WHEN 'applied' THEN 'succeeded'::identity_access_provision_status
  WHEN 'failed' THEN 'failed'::identity_access_provision_status
  WHEN 'approved' THEN 'pending'::identity_access_provision_status
  WHEN 'rejected' THEN 'terminated'::identity_access_provision_status
  WHEN 'cancelled' THEN 'terminated'::identity_access_provision_status
  ELSE 'not_started'::identity_access_provision_status END;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "identity_access_requests" SET "status" = 'approved' WHERE "status" IN ('applied', 'failed');--> statement-breakpoint
ALTER TABLE "identity_access_requests" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."identity_access_request_status";--> statement-breakpoint
CREATE TYPE "public"."identity_access_request_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TABLE "identity_access_requests" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."identity_access_request_status";--> statement-breakpoint
ALTER TABLE "identity_access_requests" ALTER COLUMN "status" SET DATA TYPE "public"."identity_access_request_status" USING "status"::"public"."identity_access_request_status";--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "source_type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "identity_access_review_items" SET "source_type" = 'group_membership' WHERE "source_type" = 'group_role';--> statement-breakpoint
DROP TYPE "public"."identity_access_review_source_type";--> statement-breakpoint
CREATE TYPE "public"."identity_access_review_source_type" AS ENUM('role', 'group_membership', 'direct_menu', 'temporary_grant');--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "source_type" SET DATA TYPE "public"."identity_access_review_source_type" USING "source_type"::"public"."identity_access_review_source_type";--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" DROP CONSTRAINT "identity_access_grant_menus_grant_id_menu_id_pk";--> statement-breakpoint
DELETE FROM "identity_access_grant_menus" WHERE "permission_code" IS NULL OR "permission_code" = '';--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ALTER COLUMN "permission_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ALTER COLUMN "status" SET DEFAULT 'preparing';--> statement-breakpoint
ALTER TABLE "user_menus" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "id" integer PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "identity_access_grant_menus_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "status" "identity_access_grant_status" DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "data_scope" "data_scope" DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "dept_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "next_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "revoked_by" integer;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD COLUMN "revoke_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD COLUMN "expiring_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD COLUMN "expired_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD COLUMN "scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD COLUMN "build_cursor_user_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD COLUMN "due_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_campaigns" ADD COLUMN "failure_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "reviewer_id" integer;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
UPDATE "identity_access_review_items" i SET "reviewer_id" = c."reviewer_id", "due_at" = c."due_at" FROM "identity_access_review_campaigns" c WHERE c."id" = i."campaign_id";--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "reviewer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ALTER COLUMN "due_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "exception_owner_id" integer;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "exception_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "next_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD COLUMN "history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
WITH entitlement_backfill AS (
  SELECT gm."id", g."status", g."starts_at", g."expires_at", g."revoked_at", g."revoked_by", g."revoke_reason",
    coalesce(i."data_scope", g."data_scope", 'self'::data_scope) AS scope,
    coalesce(i."dept_scope_ids", g."dept_scope_ids", '[]'::jsonb) AS department_ids,
    coalesce((SELECT s.value FROM "identity_access_requests" r, jsonb_array_elements(r."policy_snapshot") AS s(value) WHERE r."id" = g."request_id" AND s.value->>'permissionCode' = gm."permission_code" LIMIT 1),
      jsonb_build_object('permissionCode', gm."permission_code", 'policyId', p."id", 'version', coalesce(p."version", 0), 'riskLevel', coalesce(p."risk_level", g."risk_level")::text,
        'approvalPolicy', coalesce(p."approval_policy", 'manager'::identity_access_approval_policy)::text, 'maxDurationMinutes', coalesce(p."max_duration_minutes", 480),
        'reviewIntervalDays', coalesce(p."review_interval_days", 0), 'mfaRequired', coalesce(p."mfa_required", false), 'enabled', coalesce(p."enabled", true))) AS policy
  FROM "identity_access_grant_menus" gm
  JOIN "identity_access_grants" g ON g."id" = gm."grant_id"
  LEFT JOIN LATERAL (SELECT ri."data_scope", ri."dept_scope_ids" FROM "identity_access_request_items" ri WHERE ri."request_id" = g."request_id" AND ri."menu_id" = gm."menu_id" ORDER BY ri."id" LIMIT 1) i ON true
  LEFT JOIN LATERAL (SELECT pp.* FROM "identity_permission_policies" pp WHERE pp."permission_code" = gm."permission_code" AND (pp."tenant_id" IS NULL OR pp."tenant_id" = g."tenant_id") ORDER BY (pp."tenant_id" IS NOT DISTINCT FROM g."tenant_id") DESC, pp."id" DESC LIMIT 1) p ON true
)
UPDATE "identity_access_grant_menus" gm SET "status" = b."status", "starts_at" = b."starts_at", "expires_at" = b."expires_at", "data_scope" = b.scope, "dept_scope_ids" = b.department_ids,
  "revoked_at" = b."revoked_at", "revoked_by" = b."revoked_by", "revoke_reason" = b."revoke_reason", "policy_snapshot" = b.policy
FROM entitlement_backfill b WHERE gm."id" = b."id";--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ALTER COLUMN "policy_snapshot" SET NOT NULL;--> statement-breakpoint
UPDATE "identity_access_review_items" ri SET "source_id" = gm."id", "snapshot" = ri."snapshot" || jsonb_build_object('grantId', gm."grant_id", 'grantItemId', gm."id")
FROM "identity_access_grant_menus" gm WHERE ri."source_type" = 'temporary_grant' AND gm."grant_id" = ri."source_id" AND gm."menu_id" = (ri."snapshot"->>'menuId')::integer;--> statement-breakpoint
UPDATE "identity_access_review_campaigns" c SET "status" = 'completed', "completed_at" = now() WHERE c."status" IN ('open', 'in_progress', 'overdue') AND NOT EXISTS (SELECT 1 FROM "identity_access_review_items" i WHERE i."campaign_id" = c."id");--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD CONSTRAINT "identity_access_grant_menus_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_exception_owner_id_users_id_fk" FOREIGN KEY ("exception_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_access_grant_menus_lifecycle_idx" ON "identity_access_grant_menus" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_access_review_items_pending_source_unique" ON "identity_access_review_items" USING btree (coalesce("tenant_id", 0),"user_id","source_type","source_id") WHERE "identity_access_review_items"."decision" = 'pending';--> statement-breakpoint
CREATE INDEX "identity_access_review_items_source_history_idx" ON "identity_access_review_items" USING btree ("user_id","source_type","source_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "identity_access_grants" DROP COLUMN "source_role_id";--> statement-breakpoint
ALTER TABLE "identity_access_grants" DROP COLUMN "data_scope";--> statement-breakpoint
ALTER TABLE "identity_access_grants" DROP COLUMN "dept_scope_ids";--> statement-breakpoint
ALTER TABLE "identity_access_grant_menus" ADD CONSTRAINT "identity_access_grant_menus_permission_scope_unique" UNIQUE("grant_id","permission_code","data_scope");--> statement-breakpoint
ALTER TABLE "identity_access_review_items" ADD CONSTRAINT "identity_access_review_items_source_unique" UNIQUE NULLS NOT DISTINCT("campaign_id","user_id","source_type","source_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS identity_access_grants_cache_invalidate ON "identity_access_grants";--> statement-breakpoint
CREATE TRIGGER identity_access_grants_cache_invalidate AFTER INSERT OR UPDATE OR DELETE ON "identity_access_grants" FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('user_id');--> statement-breakpoint
DROP TRIGGER IF EXISTS identity_access_grant_menus_cache_invalidate ON "identity_access_grant_menus";--> statement-breakpoint
CREATE TRIGGER identity_access_grant_menus_cache_invalidate AFTER INSERT OR UPDATE OR DELETE ON "identity_access_grant_menus" FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('grant_id');--> statement-breakpoint
DROP TRIGGER IF EXISTS user_roles_cache_invalidate ON "user_roles";--> statement-breakpoint
CREATE TRIGGER user_roles_cache_invalidate AFTER INSERT OR UPDATE OR DELETE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('user_id');--> statement-breakpoint
DROP TRIGGER IF EXISTS user_menus_cache_invalidate ON "user_menus";--> statement-breakpoint
CREATE TRIGGER user_menus_cache_invalidate AFTER INSERT OR UPDATE OR DELETE ON "user_menus" FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('user_id');--> statement-breakpoint
DROP TRIGGER IF EXISTS user_group_members_cache_invalidate ON "user_group_members";--> statement-breakpoint
CREATE TRIGGER user_group_members_cache_invalidate AFTER INSERT OR UPDATE OR DELETE ON "user_group_members" FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('user_id');