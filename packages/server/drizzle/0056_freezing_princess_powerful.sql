ALTER TABLE "payment_orders" ADD COLUMN "original_amount" integer;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "discount_amount" integer;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "member_coupon_id" integer;