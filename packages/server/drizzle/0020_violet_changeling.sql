ALTER TABLE "workflow_data_sources" ADD COLUMN "headers_encrypted" text;--> statement-breakpoint
ALTER TABLE "workflow_event_subscriptions" ADD COLUMN "secret_encrypted" text;