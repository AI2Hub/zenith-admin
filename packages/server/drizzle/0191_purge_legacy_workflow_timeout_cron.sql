-- 清理已迁移到 workflow_jobs.task_timeout 的旧工作流审批超时 Cron。
-- 超时处理已改为 per-task 单作业模型，不再由 cron_jobs 全表扫描处理。
DELETE FROM "cron_jobs"
WHERE "handler" = 'processWorkflowTaskTimeouts'
OR "name" = '工作流审批超时处理';
