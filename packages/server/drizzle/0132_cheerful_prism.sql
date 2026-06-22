CREATE TYPE "public"."upload_session_status" AS ENUM('uploading', 'completed', 'aborted');--> statement-breakpoint
CREATE TABLE "upload_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_session_id" integer NOT NULL,
	"index" integer NOT NULL,
	"size" integer NOT NULL,
	"etag" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_upload_chunk" UNIQUE("upload_session_id","index")
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" varchar(64) NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" varchar(128),
	"chunk_size" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"storage_config_id" integer NOT NULL,
	"provider" "file_storage_provider" NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"bucket_name" varchar(256),
	"multipart_upload_id" varchar(512),
	"status" "upload_session_status" DEFAULT 'uploading' NOT NULL,
	"tenant_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upload_sessions_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
ALTER TABLE "upload_chunks" ADD CONSTRAINT "upload_chunks_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_storage_config_id_file_storage_configs_id_fk" FOREIGN KEY ("storage_config_id") REFERENCES "public"."file_storage_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;