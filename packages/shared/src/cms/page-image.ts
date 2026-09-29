import * as z from 'zod';
import { CMS_PAGE_IMAGE_RATIOS } from './constants';
import { cmsMediaFocalPointSchema } from './cms-media';
import { isValidCmsAssetUrl } from './link';

/** Shared image presentation for hero and standalone image blocks. */
export const cmsPageImageOptionsSchema = z.object({
  imageAlt: z.string().max(500).optional(), imageDecorative: z.boolean().optional(), mobileImage: z.string().max(500).refine(isValidCmsAssetUrl, '手机图片地址格式无效').optional(),
  desktopRatio: z.enum(CMS_PAGE_IMAGE_RATIOS).optional(), mobileRatio: z.enum(CMS_PAGE_IMAGE_RATIOS).optional(),
  desktopFocalPoint: cmsMediaFocalPointSchema.optional(), mobileFocalPoint: cmsMediaFocalPointSchema.optional(), linkLabel: z.string().max(200).optional(),
});
export type CmsPageImageOptions = z.infer<typeof cmsPageImageOptionsSchema>;
export function cmsPageImageDefaults(type: 'hero' | 'image') {
  return { imageAlt: '', imageDecorative: type === 'hero', mobileImage: '', desktopRatio: type === 'hero' ? '21:9' as const : 'auto' as const,
    mobileRatio: type === 'hero' ? '4:3' as const : 'auto' as const, desktopFocalPoint: { x: 0.5, y: 0.5 }, mobileFocalPoint: { x: 0.5, y: 0.5 }, linkLabel: '' };
}
export function cmsPageImagePresentation(props: Record<string, unknown>, type: 'hero' | 'image') {
  const defaults = cmsPageImageDefaults(type);
  const parsed = cmsPageImageOptionsSchema.safeParse(props);
  const data = parsed.success ? parsed.data : {};
  const values = { imageAlt: data.imageAlt ?? defaults.imageAlt, imageDecorative: data.imageDecorative ?? defaults.imageDecorative,
    mobileImage: data.mobileImage ?? defaults.mobileImage, desktopRatio: data.desktopRatio ?? defaults.desktopRatio, mobileRatio: data.mobileRatio ?? defaults.mobileRatio,
    desktopFocalPoint: data.desktopFocalPoint ?? defaults.desktopFocalPoint, mobileFocalPoint: data.mobileFocalPoint ?? defaults.mobileFocalPoint, linkLabel: data.linkLabel ?? defaults.linkLabel };
  const cssRatio = (value: typeof CMS_PAGE_IMAGE_RATIOS[number]) => value === 'auto' ? 'auto' : value.replace(':', ' / ');
  const cssPosition = (value: { x: number; y: number }) => `${Math.round(value.x * 10000) / 100}% ${Math.round(value.y * 10000) / 100}%`;
  return { ...values, desktopAspectRatio: cssRatio(values.desktopRatio), mobileAspectRatio: cssRatio(values.mobileRatio),
    desktopObjectPosition: cssPosition(values.desktopFocalPoint), mobileObjectPosition: cssPosition(values.mobileFocalPoint) };
}
