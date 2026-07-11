CREATE TYPE "public"."file_url_strategy" AS ENUM('proxy', 'public', 'presigned');--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "url_strategy" "file_url_strategy" DEFAULT 'proxy' NOT NULL;--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "public_base_url" varchar(512);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "presigned_expiry_seconds" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
ALTER TABLE "managed_files" ADD COLUMN "object_acl" "file_object_acl";--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "object_acl" "file_object_acl";