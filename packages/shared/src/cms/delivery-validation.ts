import * as z from 'zod';

/** Every probe stays beneath a configured base URL; no path can select another origin. */
export const cmsDeliveryPathSchema = z.string().trim().min(1).max(1000).refine(value => {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\?#\u0000-\u0020\u007f]/u.test(value) || /%(?:2f|5c|00)/iu.test(value)) return false;
  try { return !decodeURIComponent(value).split('/').some(part => part === '.' || part === '..'); } catch { return false; }
}, '验证路径须为本站绝对路径，不能包含查询参数、控制字符或路径跳转');
export const cmsDeliveryBaseUrlSchema = z.string().trim().max(1000).refine(value => {
  try { const url = new URL(value); return /^https?:$/u.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}, '请输入不含凭证、查询参数与片段的 HTTP/HTTPS 地址').nullable();
export const cmsDeliveryConfigValuesSchema = z.object({
  sourceBaseUrl: cmsDeliveryBaseUrlSchema,
  publicBaseUrl: cmsDeliveryBaseUrlSchema,
  paths: z.array(cmsDeliveryPathSchema).min(1).max(20),
});
export const saveCmsDeliveryConfigSchema = cmsDeliveryConfigValuesSchema.extend({ expectedVersion: z.number().int().nonnegative() });
export const startCmsDeliverySchema = z.object({ siteId: z.number().int().positive() });
