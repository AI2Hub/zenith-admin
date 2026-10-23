import { Tag } from '@douyinfe/semi-ui';
import { Check, Info, Minus, TriangleAlert, X } from 'lucide-react';
import { SEMANTIC_STATUS_META, type SemanticStatus as Status, type SemanticTone } from '@zenith/shared/core';

import { SEMANTIC_TONE_COLORS } from './semantic-status-colors';
const TONE_TOKENS: Record<SemanticTone, string> = {
  info: 'var(--semi-color-info)', success: 'var(--semi-color-success)', warning: 'var(--semi-color-warning)',
  danger: 'var(--semi-color-danger)', neutral: 'var(--semi-color-text-2)',
};
const TONE_ICONS = { info: Info, success: Check, warning: TriangleAlert, danger: X, neutral: Minus };

/** 同一语义在收件箱用标签、会话卡片用状态行展示。 */
export default function SemanticStatus({ status, variant = 'tag' }: Readonly<{ status: Status; variant?: 'tag' | 'inline' }>) {
  const { label, tone } = SEMANTIC_STATUS_META[status];
  const Icon = TONE_ICONS[tone];
  if (variant === 'inline') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: TONE_TOKENS[tone], fontSize: 13 }}>
      <Icon size={14} aria-hidden="true" />{label}
    </span>
  );
  return <Tag color={SEMANTIC_TONE_COLORS[tone]} size="small" style={{ flexShrink: 0 }}>{label}</Tag>;
}
