CREATE TABLE "workflow_data_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"method" varchar(8) DEFAULT 'GET' NOT NULL,
	"url" varchar(1024) NOT NULL,
	"headers" jsonb,
	"items_path" varchar(128),
	"value_field" varchar(64) NOT NULL,
	"label_field" varchar(64) NOT NULL,
	"keyword_param" varchar(64),
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"remark" varchar(256),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_data_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_data_sources" ADD CONSTRAINT "workflow_data_sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;