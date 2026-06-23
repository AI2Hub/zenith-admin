import type { MpMessageTemplate, MpTemplateSendLog } from '@zenith/shared';
import { SEED_MP_MESSAGE_TEMPLATES } from '@zenith/shared';

export const mockMpTemplates: MpMessageTemplate[] = SEED_MP_MESSAGE_TEMPLATES.map((t) => ({ ...t }));
export const mockMpTemplateLogs: MpTemplateSendLog[] = [];

let nextLogId = 1;
export function getNextMpTemplateLogId() {
  return nextLogId++;
}
