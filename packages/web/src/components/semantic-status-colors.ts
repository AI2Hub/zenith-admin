import type { SemanticTone } from '@zenith/shared/core';

export const SEMANTIC_TONE_COLORS = {
  info: 'blue', success: 'green', warning: 'orange', danger: 'red', neutral: 'grey',
} as const satisfies Record<SemanticTone, string>;
