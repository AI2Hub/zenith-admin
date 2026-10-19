ALTER TABLE "identity_access_requests" ADD COLUMN "policy_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD COLUMN "approval_plan" jsonb DEFAULT '{"approvalPolicy":"none","mfaRequired":false,"steps":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_access_requests" ADD COLUMN "approval_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_permission_policies" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;