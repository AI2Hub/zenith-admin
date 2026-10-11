import { WORKFLOW_ACTION_BUTTONS, type WorkflowActionButtonMeta } from '@zenith/shared/workflow';
import type { ActionButtonConfig, ActionButtonsConfig, ActionUploadMode } from './types';

/** 设计器按钮元数据（与服务端校验、审批面板同一类型定义） */
export type ActionButtonMeta = WorkflowActionButtonMeta;

/**
 * 按钮顺序、默认启用态与默认文案全部来自 shared 的 `WORKFLOW_ACTION_BUTTONS`。
 * 本文件不再自持一份默认值：此前设计器默认「转办/委派/加签/退回开启」与运行时、
 * 服务端的默认关闭相互矛盾（未配置按钮的节点在画布里显示已开启，保存后还会把
 * 错误的启用态写进流程快照，运行时却隐藏按钮、接口返回 403）。
 */
export const ACTION_BUTTON_META: readonly ActionButtonMeta[] = WORKFLOW_ACTION_BUTTONS;

const UPLOAD_MODES = new Set<ActionUploadMode>(['hidden', 'optional', 'required']);

function normalizeUploadMode(value: unknown): ActionUploadMode | undefined {
  return typeof value === 'string' && UPLOAD_MODES.has(value as ActionUploadMode)
    ? value as ActionUploadMode
    : undefined;
}

function normalizeSingleButton(
  input: ActionButtonConfig | undefined,
  meta: ActionButtonMeta,
): ActionButtonConfig {
  const button: ActionButtonConfig = {
    enabled: input?.enabled ?? meta.defaultEnabled,
    displayName: input?.displayName?.trim() || meta.defaultDisplayName,
    opinionName: input?.opinionName?.trim() || meta.defaultOpinionName,
    uploadMode: normalizeUploadMode(input?.uploadMode) ?? 'hidden',
  };
  if (meta.supportsJump && input?.jumpToNodeKey?.trim()) button.jumpToNodeKey = input.jumpToNodeKey.trim();
  return button;
}

export function getActionButtonConfig(
  value: ActionButtonsConfig | undefined,
  meta: ActionButtonMeta,
): ActionButtonConfig {
  return normalizeSingleButton(value?.[meta.key], meta);
}

export function normalizeActionButtons(value: ActionButtonsConfig | undefined): ActionButtonsConfig {
  return ACTION_BUTTON_META.reduce<ActionButtonsConfig>((acc, meta) => {
    acc[meta.key] = normalizeSingleButton(value?.[meta.key], meta);
    return acc;
  }, {});
}
