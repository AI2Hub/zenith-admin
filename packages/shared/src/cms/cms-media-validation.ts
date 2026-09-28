import * as z from 'zod';
import { cmsMediaFocalPointSchema } from './cms-media';

export const processCmsMediaSchema = z.object({
  assetVersionId: z.int().positive().optional(),
  focalPoint: cmsMediaFocalPointSchema.default({ x: 0.5, y: 0.5 }),
  posterTime: z.number().min(0).max(86400).default(0),
  subtitleResourceId: z.int().positive().nullable().default(null),
  subtitleLanguage: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).default('zh'),
  subtitleLabel: z.string().trim().min(1).max(80).default('中文字幕'),
});
