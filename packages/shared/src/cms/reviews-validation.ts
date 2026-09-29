import * as z from 'zod';
import { dateTimeStringSchema } from '../core/validation';

export const saveCmsContentReviewPolicySchema = z.object({
  expectedVersion: z.int().min(0), enabled: z.boolean(), ownerId: z.int().positive().nullable(),
  intervalDays: z.int().min(1).max(3650), nextReviewAt: dateTimeStringSchema.nullable(),
  validUntil: dateTimeStringSchema.nullable(), noticeDays: z.int().min(0).max(365),
  checkLinks: z.boolean(), checkAssetRights: z.boolean(),
});
export const completeCmsContentReviewSchema = z.object({
  expectedVersion: z.int().positive(), revisionId: z.int().positive(), note: z.string().trim().min(1).max(3000),
});
export const scanCmsContentReviewsSchema = z.object({ siteId: z.int().positive(), contentId: z.int().positive().optional() });
