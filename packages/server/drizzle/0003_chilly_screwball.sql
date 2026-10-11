ALTER TABLE "workflow_serial_counters" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "workflow_serial_counters" CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_instances" ALTER COLUMN "serial_no" SET DATA TYPE varchar(128);