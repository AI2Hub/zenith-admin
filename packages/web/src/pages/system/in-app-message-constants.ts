import { IN_APP_MESSAGE_TYPE_OPTIONS } from '@zenith/shared/messaging';
import type { InAppMessageType } from '@zenith/shared/messaging';
import { SEMANTIC_STATUS_META } from '@zenith/shared/core';
import { SEMANTIC_TONE_COLORS } from '@/components/semantic-status-colors';

type InAppMessageTypeColor = 'blue' | 'green' | 'orange' | 'red' | 'grey';

export const IN_APP_MESSAGE_TYPE_COLORS = Object.fromEntries(IN_APP_MESSAGE_TYPE_OPTIONS.map(({ value }) =>
  [value, SEMANTIC_TONE_COLORS[SEMANTIC_STATUS_META[value].tone]],
)) as Record<InAppMessageType, InAppMessageTypeColor>;

export const IN_APP_MESSAGE_TYPE_OPTIONS_WITH_COLOR = IN_APP_MESSAGE_TYPE_OPTIONS.map((option) => ({
  ...option,
  color: IN_APP_MESSAGE_TYPE_COLORS[option.value],
}));
