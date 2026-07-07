CREATE TYPE "public"."chat_scheduled_status" AS ENUM('pending', 'sent', 'canceled', 'failed');--> statement-breakpoint
CREATE TABLE "chat_quick_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" varchar(500) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_scheduled_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"type" "chat_message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"extra" jsonb,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "chat_scheduled_status" DEFAULT 'pending' NOT NULL,
	"fail_reason" varchar(255),
	"sent_message_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_quick_replies" ADD CONSTRAINT "chat_quick_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_messages" ADD CONSTRAINT "chat_scheduled_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_messages" ADD CONSTRAINT "chat_scheduled_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_quick_replies_user_idx" ON "chat_quick_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_scheduled_messages_due_idx" ON "chat_scheduled_messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "chat_scheduled_messages_sender_idx" ON "chat_scheduled_messages" USING btree ("sender_id");