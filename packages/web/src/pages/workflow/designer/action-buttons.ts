import { WORKFLOW_ACTION_BUTTONS, type WorkflowActionButtonMeta } from '@zenith/shared/workflow';
import type { ActionButtonConfig, ActionButtonsConfig, ActionUploadMode } from './types';

/** 设计器按钮元数据（与服务端校验、审批面板同一类型定义） */
export type ActionButtonMeta = WorkflowActionButtonMeta;

/**
 * 按钮顺序、默认启用态与默认文案全部来自 shared 的 `WORKFLOW_ACTION_BUTTONS`。
 * 设计器、审批面板与服务端共用这些默认值，避免展示、流程快照与权限判断不一致。
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
