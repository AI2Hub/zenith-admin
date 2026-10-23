import { describe, expect, it } from 'vitest';
import { SEMANTIC_STATUS_META } from '../core/semantic-status';
import { IN_APP_MESSAGE_TYPE_LABELS, IN_APP_MESSAGE_TYPES } from './constants';
import { getNotificationEvent, type NotificationEventKey } from './notification-events';
import { chatCardSchema } from '../chat/contracts/chat-messages';

const cases = [
  ['workflow.instance.approved', 'approved', '已通过'],
  ['workflow.instance.rejected', 'rejected', '已驳回'],
  ['workflow.instance.returned', 'revision', '待修改'],
  ['workflow.instance.withdrawn', 'withdrawn', '已撤回'],
  ['workflow.task.created', 'pending', '待处理'],
  ['workflow.node.exception', 'execution_error', '执行异常'],
] as const;

describe('notification semantic labels', () => {
  it.each(cases)('%s uses the same semantics in inbox and cards', (event, status, label) => {
    expect(getNotificationEvent(event as NotificationEventKey).inAppType).toBe(status);
    expect(IN_APP_MESSAGE_TYPE_LABELS[status]).toBe(label);
    expect(SEMANTIC_STATUS_META[status].label).toBe(label);
    expect(chatCardSchema.parse({ title: '通知', semanticStatus: status }).semanticStatus).toBe(status);
  });
  it('keeps personal decisions distinct from process outcomes and failure tones distinct from success', () => {
    expect(SEMANTIC_STATUS_META.agreed.label).toBe('已同意');
    expect(SEMANTIC_STATUS_META.declined.label).toBe('已拒绝');
    expect(SEMANTIC_STATUS_META.rejected.tone).toBe('danger');
    expect(SEMANTIC_STATUS_META.skipped.tone).toBe('neutral');
    for (const type of IN_APP_MESSAGE_TYPES) expect(SEMANTIC_STATUS_META[type]).toBeDefined();
    expect(chatCardSchema.safeParse({ title: '通知', semanticStatus: 'arbitrary-text' }).success).toBe(false);
  });
});
