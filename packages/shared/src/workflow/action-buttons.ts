import type { WorkflowActionButtonConfig, WorkflowActionButtonKey } from './types';

/**
 * 操作按钮（`actionButtons`）元数据与默认值的唯一事实源。
 *
 * 设计器、审批面板、移动审批与服务端动作校验共用此处默认值。
 *
 * 契约（docs/workflow/node-config.md）：未配置按钮时，通过与拒绝默认启用，其余协作按钮默认关闭。
 */
export interface WorkflowActionButtonMeta {
  key: WorkflowActionButtonKey;
  /** 设计器按钮列表中的名称 */
  label: string;
  /** 未配置时的启用态 */
  defaultEnabled: boolean;
  /** 未配置时的按钮文案 */
  defaultDisplayName: string;
  /** 未配置时的意见输入框标签 */
  defaultOpinionName: string;
  /** 是否支持配置跳转目标节点（仅 reject / return 生效） */
  supportsJump: boolean;
}

/** 有序按钮元数据：顺序即设计器列表与审批面板「更多操作」的展示顺序 */
export const WORKFLOW_ACTION_BUTTONS: readonly WorkflowActionButtonMeta[] = [
  { key: 'approve',    label: '通过', defaultEnabled: true,  defaultDisplayName: '同意', defaultOpinionName: '审批意见', supportsJump: false },
  { key: 'reject',     label: '拒绝', defaultEnabled: true,  defaultDisplayName: '拒绝', defaultOpinionName: '拒绝原因', supportsJump: true },
  { key: 'transfer',   label: '转办', defaultEnabled: false, defaultDisplayName: '转办', defaultOpinionName: '转办说明', supportsJump: false },
  { key: 'delegate',   label: '委派', defaultEnabled: false, defaultDisplayName: '委派', defaultOpinionName: '委派说明', supportsJump: false },
  { key: 'addSign',    label: '加签', defaultEnabled: false, defaultDisplayName: '加签', defaultOpinionName: '加签说明', supportsJump: false },
  { key: 'reduceSign', label: '减签', defaultEnabled: false, defaultDisplayName: '减签', defaultOpinionName: '减签说明', supportsJump: false },
  { key: 'return',     label: '退回', defaultEnabled: false, defaultDisplayName: '退回', defaultOpinionName: '退回原因', supportsJump: true },
];

/** 按 key 索引的默认按钮配置（节点未配置该按钮时的兜底） */
export const WORKFLOW_ACTION_BUTTON_DEFAULTS: Record<WorkflowActionButtonKey, WorkflowActionButtonConfig> =
  WORKFLOW_ACTION_BUTTONS.reduce<Record<WorkflowActionButtonKey, WorkflowActionButtonConfig>>((acc, meta) => {
    acc[meta.key] = { enabled: meta.defaultEnabled, displayName: meta.defaultDisplayName, opinionName: meta.defaultOpinionName };
    return acc;
  }, {} as Record<WorkflowActionButtonKey, WorkflowActionButtonConfig>);

/**
 * 解析节点「操作按钮设置」中的单个按钮：未配置的字段回落到默认值。
 * 前端渲染与展示、服务端启用态校验都必须走这里，避免各自维护一份默认值。
 */
export function resolveWorkflowActionButton(
  cfg: Partial<Record<WorkflowActionButtonKey, WorkflowActionButtonConfig>> | null | undefined,
  key: WorkflowActionButtonKey,
): WorkflowActionButtonConfig {
  const defaults = WORKFLOW_ACTION_BUTTON_DEFAULTS[key];
  const override = cfg?.[key];
  return override ? { ...defaults, ...override } : defaults;
}

/** 节点是否启用了某动作（未配置时按契约默认值判定） */
export function isWorkflowActionButtonEnabled(
  cfg: Partial<Record<WorkflowActionButtonKey, WorkflowActionButtonConfig>> | null | undefined,
  key: WorkflowActionButtonKey,
): boolean {
  return resolveWorkflowActionButton(cfg, key).enabled;
}
