import { load, type CheerioAPI } from 'cheerio';
import { eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { CmsPreviewEditTarget } from '@zenith/shared/cms';
import { db } from '../../db';
import { cmsPages, cmsWidgets } from '../../db/schema';
import { hasPermission } from '../../lib/context';
import { resolveCmsPageBlockManagement } from './cms-page-acl.service';
import { requireCmsContentsAccess } from './cms-content-access.service';
import { assertSiteAccess } from './cms-sites.service';
import { assertChannelAccess } from './cms-channels.service';
import { prepareCmsWorkbenchHtml } from './cms-workbench-preview-html';
import type { RenderResult } from './cms-render.service';

async function allowed(check: () => Promise<unknown>): Promise<boolean> {
  try { await check(); return true; } catch (error) {
    if (error instanceof HTTPException && [403, 404].includes(error.status)) return false;
    throw error;
  }
}

/** Targets are resolved and authorized by the server; a marker in reader-authored HTML is never an edit URL. */
export async function decorateCmsPreviewEditTargets(siteId: number, baseUrl: string, result: Exclude<RenderResult, { status: 302 }>) {
  const $ = load(prepareCmsWorkbenchHtml(result.html, baseUrl));
  $('[data-cms-preview-edit]').removeAttr('data-cms-preview-edit');
  const editTargets: CmsPreviewEditTarget[] = [];
  const attach = (elements: ReturnType<CheerioAPI>, target: Omit<CmsPreviewEditTarget, 'key'>) => {
    if (!elements.length) return;
    const key = `${target.kind}:${target.id}:${target.blockId ?? 'root'}`;
    if (!editTargets.some(item => item.key === key)) editTargets.push({ ...target, key });
    elements.attr('data-cms-preview-edit', key);
  };
  if (result.status !== 200) return { html: $.html(), editTargets };
  if (result.pageId && await hasPermission('cms:page:list')) {
    const [page] = await db.select().from(cmsPages).where(eq(cmsPages.id, result.pageId)).limit(1);
    if (page && page.siteId === siteId) {
      const management = await resolveCmsPageBlockManagement(page);
      for (const block of page.blocks) if (management.get(block.id)?.canManage) {
        const elements = $('[data-cms-page-block="true"]').filter((_index, element) => $(element).attr('data-cms-block-id') === block.id);
        attach(elements, { kind: 'page', id: page.id, siteId, blockId: block.id,
          label: `${page.name} · ${typeof block.props.title === 'string' && block.props.title ? block.props.title : '页面区块'}`,
          href: `/cms/pages?siteId=${siteId}&page=${page.id}&block=${encodeURIComponent(block.id)}` });
      }
      if (await hasPermission('cms:page:update')) attach($('main').first(), { kind: 'page', id: page.id, siteId, blockId: null, label: `页面：${page.name}`, href: `/cms/pages?siteId=${siteId}&page=${page.id}` });
    }
  }
  if (result.contentId && await hasPermission('cms:content:list') && await hasPermission('cms:content:update')
    && await allowed(() => requireCmsContentsAccess([result.contentId!]))) {
    attach($('article').first().length ? $('article').first() : $('main').first(), { kind: 'content', id: result.contentId, siteId, blockId: null,
      label: '编辑当前稿件', href: `/cms/contents/edit?id=${result.contentId}&siteId=${siteId}` });
  }
  if (result.channelId && await hasPermission('cms:channel:list') && await hasPermission('cms:channel:update')
    && await allowed(() => assertChannelAccess(result.channelId!))) {
    attach($('main').first(), { kind: 'channel', id: result.channelId, siteId, blockId: null, label: '编辑当前栏目', href: `/cms/channels?siteId=${siteId}&channel=${result.channelId}` });
  }
  if (await hasPermission('cms:widget:list') && await hasPermission('cms:widget:update')) {
    const wrappers = $('[data-cms-placement="widget"][data-cms-block-id]');
    const ids = [...new Set(wrappers.map((_index, element) => Number($(element).attr('data-cms-block-id'))).get().filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
    const widgets = ids.length ? await db.select({ id: cmsWidgets.id, siteId: cmsWidgets.siteId, name: cmsWidgets.name }).from(cmsWidgets).where(inArray(cmsWidgets.id, ids)) : [];
    for (const widget of widgets) if (await allowed(() => assertSiteAccess(widget.siteId))) attach(wrappers.filter((_index, element) => Number($(element).attr('data-cms-block-id')) === widget.id), {
      kind: 'widget', id: widget.id, siteId: widget.siteId, blockId: null, label: `部件：${widget.name}`, href: `/cms/widgets/edit?id=${widget.id}&siteId=${widget.siteId}`,
    });
  }
  if (await hasPermission('cms:site:list') && await hasPermission('cms:site:update')) {
    const target = { kind: 'site' as const, id: siteId, siteId, blockId: null, label: '站点主题与首页配置', href: `/cms/sites?editSite=${siteId}&section=appearance` };
    attach($('header,footer').filter((_index, element) => !$(element).parents('article').length), target);
    if (result.kind === 'home' && !result.pageId) {
      attach($('main').first(), target);
      $('[data-cms-placement="home.main"]').each((_index, element) => {
        const blockId = $(element).attr('data-cms-block-id') ?? '';
        attach($(element), { ...target, blockId, label: $(element).attr('data-cms-component-name') || '首页内容区块', href: `/cms/sites?editSite=${siteId}&section=appearance&homeBlock=${encodeURIComponent(blockId)}` });
      });
    }
  }
  return { html: $.html(), editTargets };
}
