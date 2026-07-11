-- 先清理历史孤儿补偿工单（其所属实例已被删除），否则加外键约束会失败
DELETE FROM "workflow_compensations" wc
WHERE NOT EXISTS (SELECT 1 FROM "workflow_instances" wi WHERE wi."id" = wc."instance_id");--> statement-breakpoint
ALTER TABLE "workflow_compensations" ADD CONSTRAINT "workflow_compensations_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;
