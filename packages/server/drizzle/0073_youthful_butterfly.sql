ALTER TABLE "user_ai_configs" ADD COLUMN "temperature" varchar(10);--> statement-breakpoint
ALTER TABLE "user_ai_configs" ADD COLUMN "max_tokens" integer;--> statement-breakpoint
ALTER TABLE "user_ai_configs" ADD COLUMN "system_prompt" text;