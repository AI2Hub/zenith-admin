ALTER TYPE "public"."report_datasource_type" ADD VALUE 'mysql';--> statement-breakpoint
ALTER TYPE "public"."report_datasource_type" ADD VALUE 'postgresql';--> statement-breakpoint
ALTER TABLE "report_dashboards" ADD COLUMN "canvas_layout" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD COLUMN "computed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_datasets" ADD COLUMN "cache_ttl" integer DEFAULT 0 NOT NULL;