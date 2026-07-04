CREATE TYPE "public"."payment_recon_handle_status" AS ENUM('pending', 'adjusted', 'suspended', 'ignored');--> statement-breakpoint
ALTER TABLE "payment_recon_items" ADD COLUMN "handle_status" "payment_recon_handle_status";--> statement-breakpoint
ALTER TABLE "payment_recon_items" ADD COLUMN "handle_remark" varchar(256);--> statement-breakpoint
ALTER TABLE "payment_recon_items" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_recon_items" ADD COLUMN "handled_by_id" integer;--> statement-breakpoint
ALTER TABLE "payment_sharing_orders" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_sharing_receivers" ADD COLUMN "auto_share" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_recon_items" ADD CONSTRAINT "payment_recon_items_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_ledger_order_type_uq" ON "payment_ledger_entries" USING btree ("order_no","type") WHERE "payment_ledger_entries"."order_no" is not null and "payment_ledger_entries"."type" in ('payment', 'fee');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_ledger_refund_uq" ON "payment_ledger_entries" USING btree ("refund_no") WHERE "payment_ledger_entries"."refund_no" is not null and "payment_ledger_entries"."type" = 'refund';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_active_biz_uq" ON "payment_orders" USING btree ("biz_type","biz_id") WHERE "payment_orders"."status" in ('pending', 'paying');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlement_period_uq" ON "payment_settlement_batches" USING btree ("channel","period_start","period_end","tenant_id") WHERE "payment_settlement_batches"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlement_period_global_uq" ON "payment_settlement_batches" USING btree ("channel","period_start","period_end") WHERE "payment_settlement_batches"."tenant_id" is null;