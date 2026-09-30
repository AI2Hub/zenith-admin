import * as z from 'zod';
import { dateTimeStringSchema, partialForUpdate } from '../core/validation';
import { cmsDocumentAnchorSchema } from './document';

export const cmsAssetRightsInputSchema = z.object({
  source: z.string().max(500).nullable().optional(), license: z.string().max(500).nullable().optional(),
  expiresAt: dateTimeStringSchema.nullable().optional(), revoked: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(), alt: z.string().max(1000).nullable().optional(),
});
export const updateCmsAssetRightsSchema = partialForUpdate(cmsAssetRightsInputSchema);
export const createCmsEditorialNoteSchema = z.object({
  revisionId: z.int().positive().nullable().optional(),
  fieldPath: z.string().max(200).nullable().optional(),
  message: z.string().trim().min(1).max(5000),
  mentionedUserIds: z.array(z.int().positive()).max(20).optional(),
  anchor: cmsDocumentAnchorSchema.nullable().optional(),
  expectedVersion: z.int().positive().optional(),
}).superRefine((value, context) => {
  if (!value.anchor) return;
  if (value.fieldPath !== 'body') context.addIssue({ code: 'custom', path: ['fieldPath'], message: '段落批注必须关联正文' });
  if (!value.revisionId && !value.expectedVersion) context.addIssue({ code: 'custom', path: ['expectedVersion'], message: '段落批注需要当前工作稿版本' });
});
export const replyCmsEditorialNoteSchema = z.object({ message: z.string().trim().min(1).max(5000), mentionedUserIds: z.array(z.int().positive()).max(20).optional() });
export const resolveCmsEditorialNoteSchema = z.object({ resolved: z.boolean() });
export const createCmsTranslationSchema = z.object({
  locale: z.string().min(2).max(35).regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  channelId: z.int().positive(), title: z.string().min(1).max(255),
});
export const cmsTypeConversionSchema = z.object({
  modelId: z.int().positive(), modelVersionId: z.int().positive().optional(),
  fieldMapping: z.record(z.string(), z.string()).optional(),
});
export const applyCmsTypeConversionSchema = cmsTypeConversionSchema.extend({ expectedVersion: z.int().positive(), acknowledgeLoss: z.boolean() });
