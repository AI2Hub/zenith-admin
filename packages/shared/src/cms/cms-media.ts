import * as z from 'zod';

export const CMS_MEDIA_PROCESSING_TASK = 'cms-media-processing';
export const CMS_MEDIA_PROCESSING_STATUSES = ['pending', 'running', 'success', 'failed', 'cancelled'] as const;
export const CMS_MEDIA_VARIANT_WIDTHS = [320, 768, 1440] as const;
export const cmsMediaFocalPointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const cmsMediaFileSchema = z.object({ fileId: z.uuid(), url: z.string(), width: z.int().positive(), height: z.int().positive() });
export const cmsMediaResultSchema = z.object({
  width: z.int().positive().nullable(), height: z.int().positive().nullable(),
  duration: z.number().nonnegative().nullable(), format: z.string().nullable(),
  videoCodec: z.string().nullable(), audioCodec: z.string().nullable(),
  focalPoint: cmsMediaFocalPointSchema,
  animated: z.boolean().optional(),
  variants: z.array(cmsMediaFileSchema.extend({ targetWidth: z.int().positive() })),
  poster: cmsMediaFileSchema.nullable(),
  subtitle: z.object({ resourceId: z.int().positive(), assetVersionId: z.int().positive(), fileId: z.uuid(), url: z.string(), language: z.string(), label: z.string() }).nullable(),
});
export const cmsMediaProcessingSchema = z.object({
  id: z.int().positive(), assetVersionId: z.int().positive(), resourceId: z.int().positive(),
  taskId: z.int().positive().nullable(), status: z.enum(CMS_MEDIA_PROCESSING_STATUSES),
  errorMessage: z.string().nullable(), result: cmsMediaResultSchema.nullable(),
  focalPoint: cmsMediaFocalPointSchema, posterTime: z.number().nonnegative(),
  subtitleResourceId: z.int().positive().nullable(), subtitleLanguage: z.string(), subtitleLabel: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
});
export const cmsFrozenMediaSchema = cmsMediaResultSchema.extend({ processingId: z.int().positive(), assetVersionId: z.int().positive(), sourceUrl: z.string().optional() });
export type CmsMediaResult = z.infer<typeof cmsMediaResultSchema>;
export type CmsMediaProcessing = z.infer<typeof cmsMediaProcessingSchema>;
export type CmsFrozenMedia = z.infer<typeof cmsFrozenMediaSchema>;

/** A snapshot only consumes results produced for its exact binary version. */
export function freezeCmsMediaResult(process: Pick<CmsMediaProcessing, 'id' | 'assetVersionId' | 'status' | 'result'>, assetVersionId: number): CmsFrozenMedia | null {
  return process.status === 'success' && process.assetVersionId === assetVersionId && process.result
    ? { ...structuredClone(process.result), processingId: process.id, assetVersionId } : null;
}
