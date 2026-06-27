import type { WorkflowEvent } from '@zenith/shared';
import { findMatchingSubscriptions } from '../../../services/workflow-event-subscriptions.service';
import { enqueueJob } from '../engine';
import { registerJobHandler } from '../registry';
import { WorkflowJobPermanentError } from '../errors';
import type { WorkflowJobContext } from '../types';

/** webhook 投递最大尝试次数（对齐旧的 5 段退避） */
const WEBHOOK_MAX_ATTEMPTS = 5;

/**
 * event_dispatch：工作流事件的持久化 Webhook 扇出。
 * 进程内订阅者（ws/通知/会话/自动化/节点监听）已由 event-bus.emit 立即派发，
 * 本作业只负责为每个匹配的 Webhook 订阅入队独立的 webhook_delivery 作业（各自重试/死信）。
 * payload: { event }
 */
async function handle({ payload }: WorkflowJobContext): Promise<void> {
  const event = payload.event as WorkflowEvent | undefined;
  if (!event || typeof event !== 'object') {
    throw new WorkflowJobPermanentError('event_dispatch: payload.event 缺失');
  }

  const subs = await findMatchingSubscriptions({
    definitionId: event.definitionId ?? 0,
    eventType: event.type,
    tenantId: event.tenantId ?? null,
  });
  for (const sub of subs) {
    await enqueueJob({
      jobType: 'webhook_delivery',
      instanceId: event.instanceId ?? null,
      taskId: 'task' in event ? event.task.id : null,
      payload: { subscriptionId: sub.id, event },
      tenantId: event.tenantId ?? null,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      idempotencyKey: `webhook:${event.eventId}:${sub.id}`,
      traceId: event.eventId,
    });
  }
}

registerJobHandler('event_dispatch', handle);
