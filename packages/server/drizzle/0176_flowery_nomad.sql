CREATE TABLE "report_alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"dataset_id" integer NOT NULL,
	"field" varchar(128),
	"aggregate" varchar(16) DEFAULT 'sum' NOT NULL,
	"op" varchar(8) DEFAULT 'gt' NOT NULL,
	"threshold" real DEFAULT 0 NOT NULL,
	"cron" varchar(64),
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" varchar(512),
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp,
	"last_triggered" boolean,
	"last_value" real,
	"remark" varchar(256),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_dashboard_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"dashboard_id" integer NOT NULL,
	"widget_id" varchar(64),
	"content" varchar(1000) NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_alert_rules" ADD CONSTRAINT "report_alert_rules_dataset_id_report_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."report_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_alert_rules" ADD CONSTRAINT "report_alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_alert_rules" ADD CONSTRAINT "report_alert_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dashboard_comments" ADD CONSTRAINT "report_dashboard_comments_dashboard_id_report_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."report_dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_dashboard_comments" ADD CONSTRAINT "report_dashboard_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_alert_rules_dataset_idx" ON "report_alert_rules" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "report_dashboard_comments_dashboard_idx" ON "report_dashboard_comments" USING btree ("dashboard_id");