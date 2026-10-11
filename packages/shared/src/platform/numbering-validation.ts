import * as z from 'zod';
import { entityStatusSchema } from '../core/api-schemas';
import { partialForUpdate } from '../core/validation';
import { NUMBERING_RESET_PERIODS, NUMBERING_SCOPES, NUMBERING_SCENE_CODES } from './constants';
import { validateNumberingConfig } from './numbering';

/**
 * Numbering is a lazy business capability. Keep its renderer and scene registry out of the
 * platform-wide validation module, which is part of the administration entry's static graph.
 * Public schemas remain available from @zenith/shared/platform.
 */
const numberingConfigBaseSchema = z.object({
  template: z.string().min(1, '请填写编号模板').max(256),
  start: z.string().regex(/^(?:0|[1-9]\d{0,18})$/, '起始值须为非负整数字符串'),
  step: z.string().regex(/^[1-9]\d{0,18}$/, '步长须为正整数字符串'),
  width: z.int().min(1).max(32),
  resetPeriod: z.enum(NUMBERING_RESET_PERIODS),
  timezone: z.string().min(1).max(64),
  scope: z.enum(NUMBERING_SCOPES),
});
export type NumberingConfig = z.infer<typeof numberingConfigBaseSchema>;
export const numberingConfigSchema = numberingConfigBaseSchema.superRefine((config, ctx) => {
  for (const message of validateNumberingConfig(config)) ctx.addIssue({ code: 'custom', message });
});

export const createNumberingRuleSchema = z.object({
  code: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_.-]*$/, '规则编码须由小写字母、数字、点、横线或下划线组成'),
  name: z.string().min(1).max(100),
  scene: z.enum(NUMBERING_SCENE_CODES),
  description: z.string().max(500).nullish(),
  status: entityStatusSchema.default('enabled'),
  draft: numberingConfigSchema,
});
export const updateNumberingRuleSchema = partialForUpdate(createNumberingRuleSchema.omit({ code: true, scene: true })).extend({
  expectedRevision: z.int().positive(),
});
export const publishNumberingRuleSchema = z.object({ expectedRevision: z.int().positive() });
export const updateNumberingDefaultSchema = z.strictObject({
  ruleId: z.int().positive(), versionId: z.int().positive(),
  expectedVersionId: z.int().positive().nullable(),
});
export const resetNumberingDefaultSchema = z.strictObject({ expectedVersionId: z.int().positive().nullable() });
export const numberingPreviewSchema = z.object({
  scene: z.enum(NUMBERING_SCENE_CODES), config: numberingConfigSchema,
  at: z.iso.datetime({ offset: true }).optional(),
  context: z.record(z.string().max(256), z.string().max(256)).optional(),
  count: z.int().min(1).max(10).default(3),
});
