import { eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { CMS_RESOURCE_URI_PREFIX, cmsSiteRelativePath, inspectCmsPageBlocks, parseCmsLink, type CmsPageBlock, type CmsPageBlockQualityIssue } from '@zenith/shared/cms';
import { db, readSnapshot, withDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import { cmsAssetRights, cmsPages, cmsResources, cmsSites, cmsWidgets } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import { assertSiteAccess } from './cms-sites.service';
import { sanitizeCmsPageBlocks } from './cms-page-blocks';
import { ensureCmsLinkTargetExists } from './cms-link.service';
import { checkCmsInternalLink } from './cms-deadlink.service';
import { cmsGenerationNow } from './cms-generation-context';

/** Called in the request/candidate executor scope; no external HTTP requests happen during publication. */
export async function inspectCmsPageBlockTargets(executor: DbExecutor, siteId: number, blocks: readonly CmsPageBlock[]): Promise<CmsPageBlockQualityIssue[]> {
  const issues = inspectCmsPageBlocks(blocks);
  const add = (blockId: string, fieldPath: string, rule: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ blockId, fieldPath, rule, message, severity });
  const [site] = await executor.select({ code: cmsSites.code }).from(cmsSites).where(eq(cmsSites.id, siteId)).limit(1);
  const imageIds = [...new Set(blocks.flatMap(block => ['image', 'src', 'mobileImage'].flatMap(key => {
    const raw = block.props[key]; return typeof raw === 'string' && raw.startsWith(CMS_RESOURCE_URI_PREFIX) ? [Number(raw.slice(CMS_RESOURCE_URI_PREFIX.length))] : [];
  })))].filter(id => Number.isSafeInteger(id) && id > 0);
  const resources = imageIds.length ? await executor.select().from(cmsResources).where(inArray(cmsResources.id, imageIds)) : [];
  const rights = imageIds.length ? await executor.select().from(cmsAssetRights).where(inArray(cmsAssetRights.resourceId, imageIds)) : [];
  const widgetIds = blocks.filter(block => block.type === 'widget-ref').map(block => Number(block.props.widgetId)).filter(id => Number.isSafeInteger(id) && id > 0);
  const widgets = widgetIds.length ? await executor.select({ id: cmsWidgets.id, siteId: cmsWidgets.siteId, status: cmsWidgets.status, data: cmsWidgets.publishedData }).from(cmsWidgets).where(inArray(cmsWidgets.id, widgetIds)) : [];
  for (const block of blocks) {
    for (const key of ['image', 'src', 'mobileImage']) {
      const raw = block.props[key]; if (typeof raw !== 'string' || !raw.startsWith(CMS_RESOURCE_URI_PREFIX)) continue;
      const id = Number(raw.slice(CMS_RESOURCE_URI_PREFIX.length)); const resource = resources.find(row => row.id === id);
      const license = rights.find(row => row.resourceId === id);
      if (!resource || resource.siteId !== siteId || resource.type !== 'image') add(block.id, key, 'image-target', '图片素材不存在、不属于本站或不是图片');
      else if (license?.revoked || (license?.expiresAt && license.expiresAt <= cmsGenerationNow())) add(block.id, key, 'image-rights', '图片素材已撤权或授权到期，请更换素材');
    }
    for (const key of ['buttonUrl', 'linkUrl']) {
      const raw = block.props[key]; if (typeof raw !== 'string' || !raw.trim()) continue;
      const ref = parseCmsLink(raw); if (!ref) continue; // Shared checks already report malformed addresses.
      try {
        await ensureCmsLinkTargetExists(siteId, raw);
        if (ref.kind === 'internal') {
          const path = cmsSiteRelativePath(ref.path, site?.code);
          if (!path || !await checkCmsInternalLink(siteId, path)) add(block.id, key, 'link-target', '站内链接没有可访问的目标，请选择正确的栏目、内容或页面');
        }
      } catch (error) {
        if (!(error instanceof HTTPException)) throw error;
        add(block.id, key, 'link-target', error.message);
      }
    }
    if (block.type === 'widget-ref' && widgetIds.includes(Number(block.props.widgetId))) {
      const widget = widgets.find(row => row.id === Number(block.props.widgetId));
      if (!widget || widget.siteId !== siteId || widget.status !== 'published' || !widget.data) add(block.id, 'widgetId', 'widget-target', '引用的部件未发布或不属于本站');
      else if (!widget.data.items.length) add(block.id, 'widgetId', 'empty-widget', '已发布部件暂无展示条目', 'warning');
    }
  }
  return issues;
}

export async function getCmsPageQuality(pageId: number) {
  const [visible] = await db.select({ siteId: cmsPages.siteId }).from(cmsPages).where(eq(cmsPages.id, pageId)).limit(1);
  await assertSiteAccess(requireRow(visible, '页面不存在').siteId);
  return readSnapshot(tx => withDbExecutor(tx, async () => {
    const [page] = await tx.select().from(cmsPages).where(eq(cmsPages.id, pageId)).limit(1);
    requireRow(page, '页面不存在');
    return { pageId, issues: await inspectCmsPageBlockTargets(tx, page.siteId, sanitizeCmsPageBlocks(page.blocks)) };
  }));
}
