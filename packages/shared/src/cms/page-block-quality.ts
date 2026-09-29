import * as z from 'zod';
import type { CmsPageBlock } from './contracts/pages';
import { isValidCmsAssetUrl, isValidCmsLink } from './link';
import { cmsPageImageOptionsSchema } from './page-image';

export const cmsPageBlockQualityIssueSchema = z.object({ blockId: z.string(), fieldPath: z.string(), rule: z.string(), severity: z.enum(['error', 'warning']), message: z.string() }).meta({ id: 'CmsPageBlockQualityIssue' });
export type CmsPageBlockQualityIssue = z.infer<typeof cmsPageBlockQualityIssueSchema>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export function cmsPageHtmlHasContent(value: unknown): boolean {
  const html = text(value).replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/giu, '').replace(/<!--[\s\S]*?-->/gu, '');
  return Boolean(html.replace(/<[^>]*>/gu, '').replace(/&nbsp;|&#0*160;|&#x0*a0;|&ZeroWidthSpace;|[\u200B-\u200D\u2060\uFEFF]/giu, '').trim())
    || /<(?:img|video|audio|source)\b[^>]*\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/iu.test(html);
}
/** Drafts can be incomplete; publishing and the editor consume these same semantic checks. */
export function inspectCmsPageBlocks(blocks: readonly Pick<CmsPageBlock, 'id' | 'type' | 'props'>[]): CmsPageBlockQualityIssue[] {
  const issues: CmsPageBlockQualityIssue[] = [];
  const add = (blockId: string, fieldPath: string, rule: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ blockId, fieldPath, rule, severity, message });
  if (!blocks.length) add('', 'blocks', 'empty-page', '页面尚无内容区块，请完成编排后再发布');
  for (const block of blocks) {
    const p = block.props;
    if (block.type === 'hero' && !text(p.title)) add(block.id, 'title', 'hero-title', '横幅缺少主标题');
    if (block.type === 'hero' && Boolean(text(p.buttonText)) !== Boolean(text(p.buttonUrl))) add(block.id, text(p.buttonText) ? 'buttonUrl' : 'buttonText', 'button-pair', '按钮文字和按钮链接需要同时填写');
    if (block.type === 'image' && !text(p.src)) add(block.id, 'src', 'image-source', '图片区块尚未选择图片');
    if (block.type === 'hero' || block.type === 'image') {
      const options = cmsPageImageOptionsSchema.safeParse(p);
      if (!options.success) for (const error of options.error.issues) add(block.id, error.path.map(String).join('.'), 'image-options', error.message);
      const sourceField = block.type === 'hero' ? 'image' : 'src';
      const hasImage = Boolean(text(p[sourceField]) || text(p.mobileImage));
      if (text(p.mobileImage) && !text(p[sourceField])) add(block.id, sourceField, 'image-fallback', '设置手机图片前，请先选择桌面或默认图片');
      if (hasImage && typeof p.imageDecorative !== 'boolean') add(block.id, 'imageDecorative', 'image-purpose', '请选择图片是否为纯装饰图片');
      if (hasImage && p.imageDecorative !== true && !text(p.imageAlt)) add(block.id, 'imageAlt', 'image-alt', '内容图片需要替代文本，说明图片传达的信息');
      if (block.type === 'image' && text(p.linkUrl) && p.imageDecorative === true && !text(p.linkLabel)) add(block.id, 'linkLabel', 'image-link-label', '装饰图片作为链接时，请填写可读的链接说明');
      for (const key of [sourceField, 'mobileImage']) if (text(p[key]) && !isValidCmsAssetUrl(text(p[key]))) add(block.id, key, 'image-url', '图片地址格式无效，请重新选择素材');
    }
    for (const key of ['buttonUrl', 'linkUrl']) if (text(p[key]) && !isValidCmsLink(text(p[key]))) add(block.id, key, 'link-format', '链接地址格式无效，请使用站内目标或完整的安全地址');
    if (block.type === 'richtext' && !cmsPageHtmlHasContent(p.html)) add(block.id, 'html', 'empty-richtext', '正文没有可展示的文字或媒体');
    if (block.type === 'columns') {
      const items = Array.isArray(p.items) ? p.items : [];
      if (!items.length) add(block.id, 'items', 'empty-columns', '多列卡片至少需要一项内容');
      items.forEach((value, index) => { const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}; if (!text(item.title) && !text(item.description)) add(block.id, `items.${index}`, 'empty-column', `第 ${index + 1} 张卡片没有内容`); });
    }
    if (block.type === 'content-list' && p.count !== undefined && (!Number.isInteger(p.count) || Number(p.count) < 1 || Number(p.count) > 20)) add(block.id, 'count', 'list-count', '内容列表数量应为 1～20 的整数');
    if (block.type === 'widget-ref' && (!Number.isSafeInteger(p.widgetId) || Number(p.widgetId) <= 0)) add(block.id, 'widgetId', 'widget-source', '请选择要展示的已发布部件');
  }
  return issues;
}
