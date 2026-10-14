import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { cmsContents, cmsChannels, cmsSites } from '../../db/schema';
import type { CmsContentRow, CmsSiteRow } from '../../db/schema';
import { siteOrigin } from './cms-render.service';
import { contentUrl } from './cms-urls';

export interface PublishedContentTarget {
  content: CmsContentRow;
  site: CmsSiteRow;
  origin: string;
  /** 内容站内路径（以 / 开头） */
  path: string;
}

/**
 * 发布副作用（搜索引擎推送、分享短链等）共用的目标解析：
 * 内容必须已发布、非外链，且站点已绑定域名；否则返回 null 由调用方静默跳过。
 */
export async function loadPublishedContentTarget(contentId: number): Promise<PublishedContentTarget | null> {
  const [row] = await db.select({
    content: cmsContents,
    channelPath: cmsChannels.path,
    channelDetailPathRule: cmsChannels.detailPathRule,
    site: cmsSites,
  })
    .from(cmsContents)
    .innerJoin(cmsChannels, eq(cmsContents.channelId, cmsChannels.id))
    .innerJoin(cmsSites, eq(cmsContents.siteId, cmsSites.id))
    .where(eq(cmsContents.id, contentId))
    .limit(1);
  if (!row || row.content.status !== 'published' || row.content.externalLink?.trim()) return null;
  const origin = siteOrigin(row.site);
  if (!origin) return null;
  const path = contentUrl('', { path: row.channelPath, detailPathRule: row.channelDetailPathRule }, row.content);
  return { content: row.content, site: row.site, origin, path };
}
