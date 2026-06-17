CREATE TABLE "checkin_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_number" integer NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"remark" varchar(256),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_rules_day_number_unique" UNIQUE("day_number")
);
--> statement-breakpoint
CREATE TABLE "member_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"checkin_date" date NOT NULL,
	"consecutive_days" integer DEFAULT 1 NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"experience_awarded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_checkins_member_id_checkin_date_unique" UNIQUE("member_id","checkin_date")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "experience" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkin_rules" ADD CONSTRAINT "checkin_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_rules" ADD CONSTRAINT "checkin_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_checkins" ADD CONSTRAINT "member_checkins_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;