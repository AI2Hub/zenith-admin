ALTER TABLE "identity_access_requests" DROP COLUMN "business_reference";--> statement-breakpoint
UPDATE "workflow_definitions" AS definition
SET "custom_form" = jsonb_set(definition."custom_form", '{variables}', (
  SELECT coalesce(jsonb_agg(variable.value ORDER BY variable.ordinality), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(definition."custom_form"->'variables', '[]'::jsonb)) WITH ORDINALITY AS variable(value, ordinality)
  WHERE variable.value->>'key' <> 'businessReference'
)), "version" = "version" + 1, "updated_at" = now()
WHERE definition."custom_form"->>'businessType' = 'identity.access_request';