export const SEMANTIC_STATUSES = [
  'info', 'success', 'warning', 'error', 'resolved', 'approved', 'rejected', 'revision',
  'pending', 'execution_error', 'withdrawn', 'agreed', 'declined', 'skipped', 'transferred', 'processed',
] as const;
export type SemanticStatus = (typeof SEMANTIC_STATUSES)[number];
export type SemanticTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** 跨通知渠道的展示语义，不决定投递优先级，也不代替业务状态机。 */
export const SEMANTIC_STATUS_META: Record<SemanticStatus, { label: string; tone: SemanticTone }> = {
  info: { label: '通知', tone: 'info' },
  success: { label: '成功', tone: 'success' },
  warning: { label: '警告', tone: 'warning' },
  error: { label: '错误', tone: 'danger' },
  resolved: { label: '已恢复', tone: 'success' },
  approved: { label: '已通过', tone: 'success' },
  rejected: { label: '已驳回', tone: 'danger' },
  revision: { label: '待修改', tone: 'warning' },
  pending: { label: '待处理', tone: 'info' },
  execution_error: { label: '执行异常', tone: 'danger' },
  withdrawn: { label: '已撤回', tone: 'neutral' },
  agreed: { label: '已同意', tone: 'success' },
  declined: { label: '已拒绝', tone: 'danger' },
  skipped: { label: '已跳过', tone: 'neutral' },
  transferred: { label: '已转交', tone: 'neutral' },
  processed: { label: '已处理', tone: 'neutral' },
};
