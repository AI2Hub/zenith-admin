import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from 'cheerio';
import { HTTPException } from 'hono/http-exception';
const state = vi.hoisted(() => ({ permissions: new Set<string>(), rows: [] as unknown[], management: new Map<string, { canManage: boolean }>(), blockedSite: 0 }));
vi.mock('../../db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => state.rows, then: (resolve: (rows: unknown[]) => unknown) => resolve(state.rows) }) }) }) } }));
vi.mock('../../lib/context', () => ({ hasPermission: async (key: string) => state.permissions.has(key) }));
vi.mock('./cms-page-acl.service', () => ({ resolveCmsPageBlockManagement: async () => state.management }));
vi.mock('./cms-content-access.service', () => ({ requireCmsContentsAccess: async () => [] }));
vi.mock('./cms-channels.service', () => ({ assertChannelAccess: async () => undefined }));
vi.mock('./cms-sites.service', () => ({ assertSiteAccess: async (id: number) => { if (id === state.blockedSite) throw new HTTPException(403); } }));
import { decorateCmsPreviewEditTargets } from './cms-preview-edit-targets';

beforeEach(() => { state.permissions.clear(); state.rows = []; state.management.clear(); state.blockedSite = 0; });
describe('authorized preview edit targets', () => {
  it('removes reader-authored editor links and emits no targets without permission', async () => {
    const result = await decorateCmsPreviewEditTargets(4, '/__cms/test', { status: 200, kind: 'detail', contentId: 8, html: '<html><body><main data-cms-preview-edit="/api/admin">Text<script>bad()</script></main></body></html>' });
    expect(result.editTargets).toEqual([]);
    expect(load(result.html)('[data-cms-preview-edit],script').length).toBe(0);
  });
  it('locates only explicitly manageable blocks, keeping opaque block IDs safely encoded', async () => {
    state.permissions.add('cms:page:list');
    state.rows = [{ id: 7, siteId: 4, name: 'Topic', blocks: [{ id: 'a:b', props: { title: 'Editor block' } }, { id: 'secret', props: {} }] }];
    state.management.set('a:b', { canManage: true }); state.management.set('secret', { canManage: false });
    const result = await decorateCmsPreviewEditTargets(4, '/__cms/test', { status: 200, kind: 'page', pageId: 7, html: '<main><section data-cms-page-block="true" data-cms-block-id="a:b">yes</section><section data-cms-page-block="true" data-cms-block-id="secret">no</section></main>' });
    expect(result.editTargets).toEqual([expect.objectContaining({ key: 'page:7:a:b', href: '/cms/pages?siteId=4&page=7&block=a%3Ab' })]);
    expect(load(result.html)('[data-cms-preview-edit]').length).toBe(1);
  });
  it('does not expose an inherited widget editor when its owning site is inaccessible', async () => {
    state.permissions.add('cms:widget:list'); state.permissions.add('cms:widget:update'); state.blockedSite = 5;
    state.rows = [{ id: 8, siteId: 5, name: 'Inherited' }];
    const result = await decorateCmsPreviewEditTargets(4, '/__cms/test', { status: 200, kind: 'home', html: '<section data-cms-placement="widget" data-cms-block-id="8">Widget</section>' });
    expect(result.editTargets).toEqual([]);
  });
});
