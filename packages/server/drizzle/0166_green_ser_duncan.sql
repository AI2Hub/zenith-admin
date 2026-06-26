CREATE TYPE "public"."login_event_type" AS ENUM('login', 'logout');--> statement-breakpoint
ALTER TABLE "login_logs" ADD COLUMN "event_type" "login_event_type" DEFAULT 'login' NOT NULL;