/**
 * 工作流事件总线
 *
 * In-process EventEmitter 薄封装。Handler 通过 queueMicrotask 异步隔离，
 * 任一 handler 抛错不影响其它 handler。
 *
 * 用法：
 *   workflowEventBus.on('task.created', async (event) => { ... });
 *   workflowEventBus.onAny(async (event) => { ... });
 *   workflowEventBus.emit({ type: 'task.created', ... });
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  WorkflowEvent,
  WorkflowEventType,
  WorkflowInstanceEventPayload,
  WorkflowNodeEventPayload,
  WorkflowTaskEventPayload,
} from '@zenith/shared';
import logger from './logger';
import { formatDateTime } from './datetime';
import { enqueueJob } from './workflow-jobs/engine';

type EventHandler<E extends WorkflowEvent = WorkflowEvent> = (event: E) => void | Promise<void>;

type EventByType<T extends WorkflowEventType> =
  T extends 'instance.created' | 'instance.approved' | 'instance.rejected' | 'instance.withdrawn'
    ? WorkflowInstanceEventPayload
    : T extends 'node.entered' | 'node.left'
    ? WorkflowNodeEventPayload
    : T extends 'task.created' | 'task.assigned' | 'task.approved' | 'task.rejected' | 'task.skipped' | 'task.transferred' | 'task.addSigned' | 'task.reduceSigned' | 'task.urged'
    ? WorkflowTaskEventPayload
    : never;

const ANY_CHANNEL = '__any__';

class WorkflowEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // 单进程内事件量可能较多，提升监听器上限
    this.emitter.setMaxListeners(50);
  }

  /** 订阅特定类型的事件 */
  on<T extends WorkflowEventType>(type: T, handler: EventHandler<EventByType<T>>): void {
    this.emitter.on(type, handler as EventHandler);
  }

  /** 订阅所有事件 */
  onAny(handler: EventHandler): void {
    this.emitter.on(ANY_CHANNEL, handler);
  }

  off(type: WorkflowEventType | typeof ANY_CHANNEL, handler: EventHandler): void {
    this.emitter.off(type, handler);
  }

  introspect(): { totalListenerCount: number; listeners: Array<{ eventType: WorkflowEventType | typeof ANY_CHANNEL; listenerCount: number }> } {
    const listeners = this.emitter.eventNames()
      .filter((name): name is string => typeof name === 'string')
      .map((name) => ({
        eventType: name as WorkflowEventType | typeof ANY_CHANNEL,
        listenerCount: this.emitter.listenerCount(name),
      }))
      .sort((a, b) => a.eventType.localeCompare(b.eventType));
    return {
      totalListenerCount: listeners.reduce((sum, item) => sum + item.listenerCount, 0),
      listeners,
    };
  }

  private normalize(event: Omit<WorkflowEvent, 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: string }): WorkflowEvent {
    return {
      ...event,
      eventId: event.eventId ?? randomUUID(),
      occurredAt: event.occurredAt ?? formatDateTime(new Date()),
    } as WorkflowEvent;
  }

  private async dispatchToHandlers(full: WorkflowEvent): Promise<void> {
    const handlers = [
      ...this.emitter.listeners(full.type),
      ...this.emitter.listeners(ANY_CHANNEL),
    ];
    const settled = await Promise.allSettled(handlers.map(async (h) => {
      try {
        await (h as EventHandler)(full);
      } catch (err) {
        logger.error('[workflow-event-bus] handler error', { type: full.type, err });
        throw err;
      }
    }));
    const rejected = settled.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  }

  /**
   * 发射事件：① 立即派发到进程内订阅者（ws/通知/会话/自动化/节点监听，低延迟）；
   * ② 入队 event_dispatch 作业用于 Webhook 持久化扇出（各订阅独立重试/死信）。
   */
  emit(event: Omit<WorkflowEvent, 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: string }): void {
    const full = this.normalize(event);
    void this.dispatchToHandlers(full).catch((err) => {
      logger.error('[workflow-event-bus] in-process dispatch failed', { type: full.type, eventId: full.eventId, err });
    });
    void enqueueJob({
      jobType: 'event_dispatch',
      instanceId: 'instanceId' in full ? full.instanceId ?? null : null,
      taskId: 'task' in full ? full.task.id : null,
      payload: { event: full },
      tenantId: full.tenantId ?? null,
      maxAttempts: 3,
      idempotencyKey: `event:${full.eventId}`,
      traceId: full.eventId,
    }).catch((err) => {
      logger.error('[workflow-event-bus] enqueue event_dispatch failed', { type: full.type, eventId: full.eventId, err });
    });
  }
}

export const workflowEventBus = new WorkflowEventBus();

export function getWorkflowEventBusIntrospection(): ReturnType<WorkflowEventBus['introspect']> {
  return workflowEventBus.introspect();
}
