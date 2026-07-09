CREATE TYPE "public"."user_feedback_category" AS ENUM('suggestion', 'bug', 'ux', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_feedback_status" AS ENUM('pending', 'processing', 'resolved', 'ignored');--> statement-breakpoint
CREATE TABLE "user_feedbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"score" integer,
	"category" "user_feedback_category" DEFAULT 'suggestion' NOT NULL,
	"content" varchar(1000),
	"page_path" varchar(200),
	"status" "user_feedback_status" DEFAULT 'pending' NOT NULL,
	"handle_remark" varchar(500),
	"handled_by" integer,
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_feedbacks_status_idx" ON "user_feedbacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_feedbacks_user_idx" ON "user_feedbacks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_feedbacks_created_at_idx" ON "user_feedbacks" USING btree ("created_at");