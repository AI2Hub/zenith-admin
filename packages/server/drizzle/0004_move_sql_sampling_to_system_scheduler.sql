-- SQL 采样从用户可编辑的 cron_jobs 迁移到固定注册的系统调度任务，避免重复采样。
DELETE FROM "cron_jobs"
WHERE "handler" = 'sampleSystemMetrics'
  AND "name" = '系统指标采样';