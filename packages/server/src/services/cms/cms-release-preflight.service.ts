import { and, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cmsReleaseBlockingMessage, uniqueCmsReleaseChecks, inspectCmsReleaseConfiguration, makeCmsReleaseCheck, type CmsConfigurationSnapshot, type CmsPageBlock, type CmsReleaseCheck } from '@zenith/shared/cms';
import type { DbExecutor } from '../../db/types';
import { cmsChannels, cmsContents, cmsPages, cmsTags, cmsWidgets, cmsWidgetRefs, cmsContentCollections } from '../../db/schema';
import { resolveEffectivelyEnabledChannelIds } from './cms-channel-visibility.service';
import { sanitizeCmsPageBlocks } from './cms-page-blocks';
import { inspectCmsPageBlockTargets } from './cms-page-quality.service';
import { cmsGenerationContext, cmsGenerationNow } from './cms-generation-context';
import { hasCmsGenerationTable } from './cms-generation-storage.service';

export { uniqueCmsReleaseChecks } from '@zenith/shared/cms';

/** Runs against the candidate executor. Every page and dependency is inspected before deciding whether to block. */
export async function inspectCmsReleaseDependencies(executor: DbExecutor, siteId: number): Promise<CmsReleaseCheck[]> {
  const generation = cmsGenerationContext();
  const hasCollections = !generation || await hasCmsGenerationTable(executor, generation.generationId, 'cms_content_collections');
  const [pages, widgets, channels, tags, placements, collections] = await Promise.all([
    executor.select().from(cmsPages).where(and(eq(cmsPages.siteId, siteId), eq(cmsPages.status, 'enabled'))),
    executor.select({ id: cmsWidgets.id, name: cmsWidgets.name, publishedName: cmsWidgets.publishedName, status: cmsWidgets.status, publishedData: cmsWidgets.publishedData }).from(cmsWidgets).where(eq(cmsWidgets.siteId, siteId)),
    executor.select({ id: cmsChannels.id, name: cmsChannels.name, code: cmsChannels.code, parentId: cmsChannels.parentId, status: cmsChannels.status }).from(cmsChannels).where(eq(cmsChannels.siteId, siteId)),
    executor.select({ id: cmsTags.id, slug: cmsTags.slug }).from(cmsTags).where(eq(cmsTags.siteId, siteId)),
    executor.select().from(cmsWidgetRefs).where(and(eq(cmsWidgetRefs.siteId, siteId), eq(cmsWidgetRefs.ownerType, 'theme_slot'))),
    hasCollections ? executor.select({ id: cmsContentCollections.id, siteId: cmsContentCollections.siteId }).from(cmsContentCollections).where(eq(cmsContentCollections.siteId, siteId)) : [],
  ]);
  const enabledChannels = resolveEffectivelyEnabledChannelIds(channels);
  const ids = [...new Set([
    ...widgets.flatMap(widget => widget.publishedData?.items.filter(item => item.sourceType === 'content').flatMap(item => item.sourceId ? [item.sourceId] : []) ?? []),
    ...[...JSON.stringify(pages.map(page => page.blocks)).matchAll(/entity:content\/(\d+)/g)].map(match => Number(match[1])),
  ])];
  const contents = ids.length ? await executor.select({ id: cmsContents.id, channelId: cmsContents.channelId, status: cmsContents.status, deletedAt: cmsContents.deletedAt, archivedAt: cmsContents.archivedAt, expireAt: cmsContents.expireAt }).from(cmsContents).where(and(eq(cmsContents.siteId, siteId), inArray(cmsContents.id, ids))) : [];
  const visibleContentIds = new Set(contents.filter(row => row.status === 'published' && !row.deletedAt && !row.archivedAt && (!row.expireAt || row.expireAt > cmsGenerationNow()) && enabledChannels.has(row.channelId)).map(row => row.id));
  const configuration: CmsConfigurationSnapshot = { replaceAll: [], tables: {
    cms_pages: pages,
    cms_widgets: widgets.map(row => ({ id: row.id, name: row.name, published_name: row.publishedName, status: row.status, published_data: row.publishedData })),
    cms_channels: channels, cms_tags: tags,
    cms_content_collections: collections.map(row => ({ id: row.id, site_id: row.siteId })),
    cms_widget_refs: placements.map(row => ({ owner_type: row.ownerType, field: row.field, widget_id: row.widgetId })),
  } };
  const checks = inspectCmsReleaseConfiguration({ siteId, configuration, enabledChannelIds: enabledChannels, visibleContentIds });
  for (const page of pages) {
    const object = { kind: 'page' as const, id: page.id, title: page.name, revisionId: null };
    let blocks: CmsPageBlock[];
    try { blocks = sanitizeCmsPageBlocks(page.blocks); }
    catch (error) {
      if (!(error instanceof HTTPException)) throw error;
      checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'page-shape', fieldPath: 'blocks', message: error.message }));
      continue;
    }
    for (const issue of await inspectCmsPageBlockTargets(executor, siteId, blocks)) {
      if (checks.some(check => check.object.kind === 'page' && check.object.id === page.id && check.nodeId === (issue.blockId || null) && check.code === issue.rule && check.fieldPath === issue.fieldPath)) continue;
      checks.push(makeCmsReleaseCheck({ siteId, object, code: issue.rule, fieldPath: issue.fieldPath, nodeId: issue.blockId || null, severity: issue.severity, message: issue.message }));
    }
  }
  return uniqueCmsReleaseChecks(checks);
}

export async function assertCmsReleaseDependencies(executor: DbExecutor, siteId: number): Promise<void> {
  const message = cmsReleaseBlockingMessage(await inspectCmsReleaseDependencies(executor, siteId));
  if (message) throw new HTTPException(409, { message });
}
