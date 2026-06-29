-- 清理已迁移到「系统调度」的工作流旧定时任务。
-- 这些任务的 handler 已从 cron_jobs 处理器注册表移除，保留在旧「定时任务」页会导致重复控制面和失败日志。
DELETE FROM "cron_jobs"
WHERE "handler" IN (
  'replayWorkflowEventOutbox',
  'recoverWorkflowRuntimeSideEffects',
  'recoverStuckWorkflowSubProcesses'
)
OR "name" IN (
  '工作流事件 Outbox 重放',
  '工作流运行时副作用恢复',
  '工作流子流程恢复'
);
