CREATE TYPE "public"."channel_message_status" AS ENUM('sent', 'draft', 'scheduled');--> statement-breakpoint
ALTER TYPE "public"."channel_message_type" ADD VALUE 'image';--> statement-breakpoint
ALTER TYPE "public"."channel_message_type" ADD VALUE 'news';--> statement-breakpoint
CREATE TABLE "channel_quick_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "status" "channel_message_status" DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "target_spec" jsonb;--> statement-breakpoint
ALTER TABLE "channel_quick_replies" ADD CONSTRAINT "channel_quick_replies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_quick_replies" ADD CONSTRAINT "channel_quick_replies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_quick_replies" ADD CONSTRAINT "channel_quick_replies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;