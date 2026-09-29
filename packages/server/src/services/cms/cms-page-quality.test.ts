import { describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import type { DbExecutor } from '../../db/types';
import { cmsAssetRights, cmsResources, cmsSites, cmsWidgets } from '../../db/schema';
import type { CmsPageBlock } from '@zenith/shared/cms';

const links = vi.hoisted(() => ({ target: vi.fn(), internal: vi.fn() }));
vi.mock('./cms-link.service', () => ({ ensureCmsLinkTargetExists: links.target }));
vi.mock('./cms-deadlink.service', () => ({ checkCmsInternalLink: links.internal }));
import { inspectCmsPageBlockTargets } from './cms-page-quality.service';

describe('saved page/candidate quality inspection', () => {
  it('reports revoked, cross-site, missing internal and unpublished widget targets without losing block identities', async () => {
    links.target.mockImplementation(async (_siteId: number, value: string) => { if (value === 'entity:content/404') throw new HTTPException(400, { message: '内容未公开' }); });
    links.internal.mockResolvedValue(false);
    const rows = new Map<unknown, unknown[]>([
      [cmsSites, [{ code: 'qa' }]], [cmsResources, [{ id: 77, siteId: 1, type: 'image' }, { id: 78, siteId: 2, type: 'image' }]],
      [cmsAssetRights, [{ resourceId: 77, revoked: true, expiresAt: null }]], [cmsWidgets, [{ id: 9, siteId: 1, status: 'draft', data: null }]],
    ]);
    const executor = { select: () => ({ from: (table: unknown) => ({ where: () => Object.assign(Promise.resolve(rows.get(table) ?? []), { limit: async () => rows.get(table) ?? [] }) }) }) } as unknown as DbExecutor;
    const blocks: CmsPageBlock[] = [
      { id: 'revoked-photo', type: 'image', props: { src: 'cms-res://77', imageDecorative: true } },
      { id: 'mobile-photo', type: 'hero', props: { title: '文化门户', image: '/hero.jpg', mobileImage: 'cms-res://78', imageDecorative: true } },
      { id: 'entity-button', type: 'hero', props: { title: '指南', buttonText: '阅读指南', buttonUrl: 'entity:content/404' } },
      { id: 'path-button', type: 'image', props: { src: '/photo.jpg', imageDecorative: true, linkLabel: '活动日程', linkUrl: '/missing' } },
      { id: 'unpublished-widget', type: 'widget-ref', props: { widgetId: 9 } },
    ];
    const issues = await inspectCmsPageBlockTargets(executor, 1, blocks);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockId: 'revoked-photo', fieldPath: 'src', rule: 'image-rights' }),
      expect.objectContaining({ blockId: 'mobile-photo', fieldPath: 'mobileImage', rule: 'image-target' }),
      expect.objectContaining({ blockId: 'entity-button', fieldPath: 'buttonUrl', message: '内容未公开' }),
      expect.objectContaining({ blockId: 'path-button', fieldPath: 'linkUrl', rule: 'link-target' }),
      expect.objectContaining({ blockId: 'unpublished-widget', fieldPath: 'widgetId', rule: 'widget-target' }),
    ]));
  });
});
