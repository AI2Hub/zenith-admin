ALTER TYPE "public"."mp_reply_content_type" ADD VALUE IF NOT EXISTS 'voice';--> statement-breakpoint
ALTER TYPE "public"."mp_reply_content_type" ADD VALUE IF NOT EXISTS 'video';--> statement-breakpoint
ALTER TYPE "public"."mp_reply_content_type" ADD VALUE IF NOT EXISTS 'news';--> statement-breakpoint
ALTER TABLE "mp_auto_replies" ADD COLUMN IF NOT EXISTS "news_articles" jsonb;