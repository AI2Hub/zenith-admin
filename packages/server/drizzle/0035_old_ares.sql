ALTER TYPE "public"."status" RENAME VALUE 'active' TO 'enabled';--> statement-breakpoint

ALTER TABLE "departments" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "dict_items" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "dicts" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "email_configs" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "file_storage_configs" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "menus" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'enabled'::"public"."status";--> statement-breakpoint

UPDATE "dict_items"
SET "value" = 'enabled'
WHERE "value" = 'active'
	AND "dict_id" IN (
		SELECT "id"
		FROM "dicts"
		WHERE "code" = 'common_status'
	);
