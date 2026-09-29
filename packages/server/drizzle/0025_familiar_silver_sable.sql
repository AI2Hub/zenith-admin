CREATE TABLE "cms_delivery_expiry_receipts" (
	"resource_id" integer PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_delivery_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_delivery_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"release_id" integer,
	"generation_id" integer,
	"activation_id" integer,
	"visibility_epoch" integer NOT NULL,
	"config_version" integer NOT NULL,
	"event_key" varchar(240) NOT NULL,
	"cause" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'activated' NOT NULL,
	"task_id" integer,
	"source_base_url" varchar(1000),
	"public_base_url" varchar(1000),
	"source_host" varchar(255),
	"purge_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"purge_http_status" integer,
	"purge_message" text,
	"paths" jsonb NOT NULL,
	"observations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_delivery_states" (
	"site_id" integer PRIMARY KEY NOT NULL,
	"visibility_epoch" integer DEFAULT 0 NOT NULL,
	"latest_run_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_deployments" ADD COLUMN "visibility_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_delivery_expiry_receipts" ADD CONSTRAINT "cms_delivery_expiry_receipts_resource_id_cms_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."cms_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_runs" ADD CONSTRAINT "cms_delivery_runs_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_runs" ADD CONSTRAINT "cms_delivery_runs_release_id_cms_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."cms_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_runs" ADD CONSTRAINT "cms_delivery_runs_generation_id_cms_deployments_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."cms_deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_runs" ADD CONSTRAINT "cms_delivery_runs_activation_id_cms_release_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."cms_release_activations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_runs" ADD CONSTRAINT "cms_delivery_runs_task_id_async_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."async_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_states" ADD CONSTRAINT "cms_delivery_states_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_delivery_states" ADD CONSTRAINT "cms_delivery_states_latest_run_id_cms_delivery_runs_id_fk" FOREIGN KEY ("latest_run_id") REFERENCES "public"."cms_delivery_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_delivery_runs_site_event_uq" ON "cms_delivery_runs" USING btree ("site_id","event_key");--> statement-breakpoint
CREATE INDEX "cms_delivery_runs_site_id_idx" ON "cms_delivery_runs" USING btree ("site_id","id");--> statement-breakpoint
CREATE INDEX "cms_delivery_runs_release_idx" ON "cms_delivery_runs" USING btree ("release_id");