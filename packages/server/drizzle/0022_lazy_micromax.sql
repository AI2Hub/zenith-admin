ALTER TYPE "public"."cms_editorial_task_source" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "cms_editorial_task_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_editorial_task_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"round_no" integer NOT NULL,
	"version" integer NOT NULL,
	"action" varchar(40) NOT NULL,
	"note" text,
	"actor_id" integer,
	"actor_name" varchar(100),
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_editorial_task_observations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_editorial_task_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"window_days" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"settles_at" timestamp with time zone NOT NULL,
	"outcome" varchar(40) DEFAULT 'pending' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"other_activation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cms_editorial_task_rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_editorial_task_rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"round_no" integer NOT NULL,
	"source_evidence" jsonb NOT NULL,
	"goal" jsonb,
	"solution_revision_id" integer,
	"solution_hash" varchar(64),
	"release_id" integer,
	"deployment_id" integer,
	"activation_id" integer,
	"activated_at" timestamp with time zone,
	"interrupted_at" timestamp with time zone,
	"interruption_reason" text,
	"verified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_review_policies" (
	"content_id" integer PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"owner_id" integer,
	"interval_days" integer DEFAULT 90 NOT NULL,
	"next_review_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"check_links" boolean DEFAULT true NOT NULL,
	"check_asset_rights" boolean DEFAULT true NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"last_reviewed_revision_id" integer,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_check_task_id" integer,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issue_cycles" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_review_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cms_content_review_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content_id" integer NOT NULL,
	"revision_id" integer NOT NULL,
	"generation_id" integer NOT NULL,
	"note" text NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(100) NOT NULL,
	"next_review_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_editorial_tasks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cms_editorial_tasks" ALTER COLUMN "status" SET DEFAULT 'open'::text;--> statement-breakpoint
UPDATE cms_editorial_tasks SET status='open', version=version+1 WHERE status='done';--> statement-breakpoint
DROP TYPE "public"."cms_editorial_task_status";--> statement-breakpoint
CREATE TYPE "public"."cms_editorial_task_status" AS ENUM('open', 'in_progress', 'edit_done', 'online', 'observing', 'verified', 'cancelled');--> statement-breakpoint
ALTER TABLE "cms_editorial_tasks" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."cms_editorial_task_status";--> statement-breakpoint
ALTER TABLE "cms_editorial_tasks" ALTER COLUMN "status" SET DATA TYPE "public"."cms_editorial_task_status" USING "status"::"public"."cms_editorial_task_status";--> statement-breakpoint
ALTER TABLE "cms_editorial_tasks" ADD COLUMN "round_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_history" ADD CONSTRAINT "cms_editorial_task_history_task_id_cms_editorial_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cms_editorial_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_observations" ADD CONSTRAINT "cms_editorial_task_observations_task_id_cms_editorial_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cms_editorial_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_observations" ADD CONSTRAINT "cms_editorial_task_observations_round_id_cms_editorial_task_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."cms_editorial_task_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_rounds" ADD CONSTRAINT "cms_editorial_task_rounds_task_id_cms_editorial_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cms_editorial_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_rounds" ADD CONSTRAINT "cms_editorial_task_rounds_solution_revision_id_cms_content_revisions_id_fk" FOREIGN KEY ("solution_revision_id") REFERENCES "public"."cms_content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_rounds" ADD CONSTRAINT "cms_editorial_task_rounds_release_id_cms_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."cms_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_rounds" ADD CONSTRAINT "cms_editorial_task_rounds_deployment_id_cms_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."cms_deployments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_editorial_task_rounds" ADD CONSTRAINT "cms_editorial_task_rounds_activation_id_cms_release_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."cms_release_activations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_content_id_cms_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."cms_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_site_id_cms_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cms_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_last_reviewed_revision_id_cms_content_revisions_id_fk" FOREIGN KEY ("last_reviewed_revision_id") REFERENCES "public"."cms_content_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_last_check_task_id_async_tasks_id_fk" FOREIGN KEY ("last_check_task_id") REFERENCES "public"."async_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_policies" ADD CONSTRAINT "cms_content_review_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_records" ADD CONSTRAINT "cms_content_review_records_content_id_cms_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."cms_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_review_records" ADD CONSTRAINT "cms_content_review_records_revision_id_cms_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."cms_content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_editorial_history_task_idx" ON "cms_editorial_task_history" USING btree ("task_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_editorial_observations_round_window_uq" ON "cms_editorial_task_observations" USING btree ("round_id","window_days");--> statement-breakpoint
CREATE INDEX "cms_editorial_observations_due_idx" ON "cms_editorial_task_observations" USING btree ("outcome","settles_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_editorial_task_rounds_task_round_uq" ON "cms_editorial_task_rounds" USING btree ("task_id","round_no");--> statement-breakpoint
CREATE INDEX "cms_content_review_policies_due_idx" ON "cms_content_review_policies" USING btree ("enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "cms_content_review_policies_owner_idx" ON "cms_content_review_policies" USING btree ("site_id","owner_id","next_review_at");--> statement-breakpoint
CREATE INDEX "cms_content_review_records_content_idx" ON "cms_content_review_records" USING btree ("content_id","id");
--> statement-breakpoint
-- Establish a new evidence baseline; no historical statistics or success claims are fabricated.
INSERT INTO cms_editorial_task_rounds(task_id,round_no,source_evidence)
SELECT id,round_no,jsonb_build_object('kind',source::text,'summary','启用效果闭环时建立的基准轮；请重新绑定解决修订和处理目标',
  'capturedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'snapshot',null,'metadata',jsonb_build_object('baseline',true))
FROM cms_editorial_tasks;
--> statement-breakpoint
INSERT INTO cms_editorial_task_history(task_id,round_no,version,action,note,actor_name,snapshot)
SELECT id,round_no,version,'baseline','建立新的效果追踪基准，不将既有编辑完成等同于效果验证','系统',jsonb_build_object('status',status::text,'contentId',content_id)
FROM cms_editorial_tasks;
--> statement-breakpoint
CREATE FUNCTION cms_editorial_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CMS editorial task history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cms_editorial_history_no_update_delete BEFORE UPDATE OR DELETE ON cms_editorial_task_history FOR EACH ROW EXECUTE FUNCTION cms_editorial_history_immutable();
--> statement-breakpoint
CREATE TRIGGER cms_editorial_history_no_truncate BEFORE TRUNCATE ON cms_editorial_task_history FOR EACH STATEMENT EXECUTE FUNCTION cms_editorial_history_immutable();
