import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { workflowTasks } from '../db/schema';
import logger from './logger';
import { deleteSystemJob, registerSystemQueueWorker, sendSystemJobAfter } from './pg-boss-scheduler';

const DELAY_QUEUE = 'workflow-delay-wakeup';

interface DelayWakeJob {
  taskId: number;
}

function jobId(taskId: number): string {
  return `workflow-delay-${taskId}`;
}

function scheduleAt(taskId: number, wakeAt: Date): void {
  void sendSystemJobAfter<DelayWakeJob>(
    DELAY_QUEUE,
    { taskId },
    wakeAt,
    {
      id: jobId(taskId),
      singletonKey: jobId(taskId),
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 300,
      retentionSeconds: 60 * 60 * 24 * 7,
    },
  ).catch((err) => {
    logger.error('Delay scheduler: failed to enqueue wake job', { taskId, wakeAt, err });
  });
}

function cancelScheduled(taskId: number): void {
  void deleteSystemJob(DELAY_QUEUE, jobId(taskId)).catch((err) => {
    logger.warn('Delay scheduler: failed to delete wake job', { taskId, err });
  });
}

async function initialize(): Promise<void> {
  await registerSystemQueueWorker<DelayWakeJob>({
    name: DELAY_QUEUE,
    title: '工作流延时唤醒 Worker',
    module: '工作流',
    description: '消费 delay 节点唤醒队列，到期后恢复等待中的工作流任务。',
    handler: async ({ taskId }) => {
      const { resumeDelayTask } = await import('../services/workflow-resume.service');
      const resumed = await resumeDelayTask(taskId);
      if (!resumed) {
        logger.info('Delay scheduler: wake job skipped because task is no longer waiting', { taskId });
        return `任务 ${taskId} 已不处于等待状态，跳过唤醒`;
      }
      return `任务 ${taskId} 已恢复执行`;
    },
    queueOptions: {
      retentionSeconds: 60 * 60 * 24 * 7,
      deleteAfterSeconds: 60 * 60 * 24 * 7,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 300,
    },
  });

  const rows = await db.select({ id: workflowTasks.id, wakeAt: workflowTasks.wakeAt }).from(workflowTasks)
    .where(and(
      eq(workflowTasks.status, 'waiting'),
      eq(workflowTasks.nodeType, 'delay'),
      isNotNull(workflowTasks.wakeAt),
    ));
  for (const row of rows) {
    if (row.wakeAt) scheduleAt(row.id, row.wakeAt);
  }
  logger.info(`Delay scheduler initialized: ${rows.length} pending delay task(s) enqueued to pg-boss`);
}

export const delayScheduler = { initialize, scheduleAt, cancelScheduled };
