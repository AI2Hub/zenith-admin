DROP INDEX "analytics_settings_tenant_idx";--> statement-breakpoint
ALTER TABLE "user_events" ADD COLUMN "event_id" uuid;--> statement-breakpoint
DELETE FROM "analytics_settings" AS duplicate
USING "analytics_settings" AS canonical
WHERE coalesce(duplicate."tenant_id", 0) = coalesce(canonical."tenant_id", 0)
  AND duplicate."id" > canonical."id";--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_settings_tenant_uq" ON "analytics_settings" USING btree (coalesce("tenant_id", 0));--> statement-breakpoint
CREATE UNIQUE INDEX "user_events_event_id_uq" ON "user_events" USING btree ("event_id");