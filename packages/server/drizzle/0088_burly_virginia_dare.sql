ALTER TYPE "public"."file_storage_provider" ADD VALUE 'obs';--> statement-breakpoint
ALTER TYPE "public"."file_storage_provider" ADD VALUE 'kodo';--> statement-breakpoint
ALTER TYPE "public"."file_storage_provider" ADD VALUE 'bos';--> statement-breakpoint
ALTER TYPE "public"."file_storage_provider" ADD VALUE 'azure';--> statement-breakpoint
ALTER TYPE "public"."file_storage_provider" ADD VALUE 'sftp';--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "obs_endpoint" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "obs_bucket" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "obs_access_key_id" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "obs_secret_access_key" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "kodo_access_key" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "kodo_secret_key" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "kodo_bucket" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "kodo_region" varchar(64);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "kodo_endpoint" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "bos_endpoint" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "bos_bucket" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "bos_access_key_id" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "bos_secret_access_key" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "azure_account_name" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "azure_account_key" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "azure_container_name" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "azure_endpoint" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_host" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_port" integer DEFAULT 22;--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_username" varchar(128);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_password" varchar(256);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_private_key" text;--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_root_path" varchar(512);--> statement-breakpoint
ALTER TABLE "file_storage_configs" ADD COLUMN "sftp_base_url" varchar(512);