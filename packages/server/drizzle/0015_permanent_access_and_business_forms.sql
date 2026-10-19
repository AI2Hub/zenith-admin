ALTER TABLE "identity_access_grant_menus" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_grants" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
UPDATE "identity_permission_policies"
SET "max_duration_minutes" = NULL, "version" = "version" + 1, "updated_at" = now()
WHERE "max_duration_minutes" IS NOT NULL;--> statement-breakpoint
UPDATE "workflow_definitions" AS definition
SET "custom_form" = jsonb_set(
  jsonb_set(definition."custom_form", '{variables}', (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN variable.value->>'key' IN ('startsAt', 'expiresAt') THEN jsonb_set(variable.value, '{type}', '"date"'::jsonb)
        WHEN variable.value->>'key' IN ('targetUserId', 'managerId', 'securityApproverId', 'secondSecurityApproverId') THEN jsonb_set(variable.value, '{type}', '"user"'::jsonb)
        ELSE variable.value
      END ORDER BY variable.ordinality
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(definition."custom_form"->'variables', '[]'::jsonb)) WITH ORDINALITY AS variable(value, ordinality)
  )), '{actionComponent}', '"biz/access/AccessRequestApprovalForm"'::jsonb
), "version" = "version" + 1, "updated_at" = now()
WHERE definition."custom_form"->>'businessType' = 'identity.access_request';