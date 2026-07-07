ALTER TYPE "public"."chat_member_role" ADD VALUE 'admin' BEFORE 'member';--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD COLUMN "muted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "mute_all" boolean DEFAULT false NOT NULL;