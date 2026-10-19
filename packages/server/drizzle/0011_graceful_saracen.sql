DROP INDEX "identity_access_grants_request_idx";--> statement-breakpoint
ALTER TABLE "identity_access_grants" ADD CONSTRAINT "identity_access_grants_request_unique" UNIQUE("request_id");--> statement-breakpoint
UPDATE "workflow_definitions"
SET "custom_form" = jsonb_set("custom_form", '{businessType}', '"identity.access_request"'::jsonb)
WHERE "id" = 5 AND "name" = '权限申请';