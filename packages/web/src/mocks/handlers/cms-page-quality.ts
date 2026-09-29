import { cmsPageContract, CMS_RESOURCE_URI_PREFIX, cmsSiteRelativePath, inspectCmsPageBlocks, parseCmsLink, type CmsPageBlockQualityIssue } from '@zenith/shared/cms';
import { mock } from '../utils/contract';
import { requireItem } from '../utils/crud';
import { mockCmsChannels, mockCmsContents, mockCmsInteractions, mockCmsPages, mockCmsResources, mockCmsSites, mockCmsWidgets } from '../data/cms';
import { getMockCmsPublishedContent } from '../utils/cms-revisions';
import { getMockCmsAssetRights } from './cms-editorial';

export const cmsPageQualityHandlers = [mock(cmsPageContract.quality, ({ params, ok }) => {
  const page = requireItem(mockCmsPages, params.id, '页面不存在', { status: 404 });
  const issues = inspectCmsPageBlocks(page.blocks); const site = mockCmsSites.find(row => row.id === page.siteId);
  const add = (blockId: string, fieldPath: string, rule: string, message: string, severity: CmsPageBlockQualityIssue['severity'] = 'error') => issues.push({ blockId, fieldPath, rule, message, severity });
  for (const block of page.blocks) {
    for (const key of ['image', 'src', 'mobileImage']) {
      const value = block.props[key]; if (typeof value !== 'string' || !value.startsWith(CMS_RESOURCE_URI_PREFIX)) continue;
      const id = Number(value.slice(CMS_RESOURCE_URI_PREFIX.length)); const resource = mockCmsResources.find(row => row.id === id && row.siteId === page.siteId && row.type === 'image');
      if (!resource) { add(block.id, key, 'image-target', '图片素材不存在、不属于本站或不是图片'); continue; }
      const rights = getMockCmsAssetRights(id);
      if (rights.revoked || (rights.expiresAt && new Date(rights.expiresAt).getTime() <= Date.now())) add(block.id, key, 'image-rights', '图片素材已撤权或授权到期，请更换素材');
    }
    for (const key of ['buttonUrl', 'linkUrl']) {
      const value = block.props[key]; const ref = parseCmsLink(typeof value === 'string' ? value : ''); if (!ref || ref.kind === 'external') continue;
      let found = false;
      if (ref.kind === 'entity') found = ref.entityType === 'content'
        ? ref.id !== null && getMockCmsPublishedContent(ref.id)?.siteId === page.siteId
        : mockCmsChannels.some(row => row.siteId === page.siteId && row.status === 'enabled' && (ref.id !== null ? row.id === ref.id : row.code === ref.code));
      else {
        const relative = cmsSiteRelativePath(ref.path, site?.code); const path = relative?.split(/[?#]/u)[0].replace(/^\/+|\/+$/gu, '') ?? null;
        found = path !== null && (!path || ['index.html', 'search', 'rss.xml', 'sitemap.xml', 'robots.txt'].includes(path)
          || mockCmsPages.some(row => row.siteId === page.siteId && row.status === 'enabled' && (row.path === path || `p/${row.slug}` === path || `p/${row.slug}/index.html` === path))
          || mockCmsChannels.some(row => row.siteId === page.siteId && row.status === 'enabled' && row.path === path)
          || mockCmsInteractions.some(row => row.siteId === page.siteId && row.status === 'published' && `interaction/${row.code}` === path)
          || mockCmsContents.some(row => row.siteId === page.siteId && getMockCmsPublishedContent(row.id) && (row.staticPath === path || mockCmsChannels.some(channel => channel.id === row.channelId && `${channel.path}/${row.slug ?? row.id}.html` === path))));
      }
      if (!found) add(block.id, key, 'link-target', '站内链接没有可访问的目标，请选择正确的栏目、内容或页面');
    }
    if (block.type === 'widget-ref' && Number.isSafeInteger(block.props.widgetId)) {
      const widget = mockCmsWidgets.find(row => row.id === block.props.widgetId && row.siteId === page.siteId);
      if (!widget || widget.status !== 'published' || !widget.publishedData) add(block.id, 'widgetId', 'widget-target', '引用的部件未发布或不属于本站');
      else if (!widget.publishedData.items.length) add(block.id, 'widgetId', 'empty-widget', '已发布部件暂无展示条目', 'warning');
    }
  }
  return ok({ pageId: page.id, issues });
})];
