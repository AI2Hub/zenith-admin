import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsPageBlock } from '@zenith/shared/cms';
import { assertCmsPageBlockMutationAllowed } from './cms-page-blocks';
import type { CmsPageRow } from '../../db/schema';

const state = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), transaction: vi.fn(), access: vi.fn(), canonical: vi.fn(), acl: vi.fn(), sources: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: state.select, transaction: state.transaction } }));
vi.mock('./cms-sites.service', () => ({ assertSiteAccess: state.access, ensureCmsSiteExists: vi.fn() }));
vi.mock('./cms-site-publish-lock.service', () => ({ lockCmsSiteForMutation: async () => ({ id: 3 }), bumpCmsTemplateRefsRevision: async () => 1 }));
vi.mock('./cms-publish-outbox.service', () => ({ enqueueCmsPublishOutboxes: vi.fn(), insertCmsSiteRefsRebuildOutbox: async () => ({ id: 1 }) }));
vi.mock('./cms-resource-refs.service', () => ({ canonicalizeCmsResourceContent: state.canonical, syncCmsResourceRefs: vi.fn(), resolveCmsResourcePayload: async (value: unknown) => value, deleteCmsResourceRefsForOwner: vi.fn() }));
vi.mock('./cms-page-acl.service', () => ({ assertCmsPageBlocksUpdateAllowed: state.acl, decorateCmsPageBlocks: async (row: CmsPageRow) => row.blocks, decorateCmsPageBlocksBatch: vi.fn() }));
vi.mock('./cms-page-presets.service', () => ({ assertCmsPagePresetSources: state.sources }));
vi.mock('./cms-widgets.service', () => ({ syncCmsPageWidgetRefs: vi.fn(), deleteCmsPageWidgetRefs: vi.fn() }));
vi.mock('../../lib/context', () => ({ hasPermission: async () => false }));
import { updateCmsPage } from './cms-pages.service';

const saved: CmsPageRow = {
  id: 12, siteId: 3, name: '页面', slug: 'test', path: null, isHome: false, requiresDynamic: false,
  blocks: [{ id: 'readonly', type: 'image', props: { src: 'cms-res://10' } }, { id: 'editable', type: 'hero', props: { title: '原始' } }],
  status: 'enabled', seoTitle: null, seoKeywords: null, seoDescription: null, remark: null,
  createdBy: 1, updatedBy: 1, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  const current = structuredClone(saved);
  state.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [current], for: () => ({ limit: async () => [current] }) }) }) }));
  state.update.mockImplementation(() => ({ set: (values: object) => ({ where: () => ({ returning: async () => [Object.assign(current, values)] }) }) }));
  state.canonical.mockImplementation(async (_tx, _site, blocks) => JSON.parse(JSON.stringify(blocks).replaceAll('/resolved-image.jpg', 'cms-res://10')));
  state.acl.mockImplementation(async (before: CmsPageRow, after: CmsPageBlock[]) => assertCmsPageBlockMutationAllowed({
    before: before.blocks as CmsPageBlock[], after, manageableBlockIds: new Set(['editable']), canCreate: false,
  }));
  const tx = { select: state.select, update: state.update, delete: () => ({ where: async () => [] }) };
  state.transaction.mockImplementation(async (fn: (value: typeof tx) => unknown) => fn(tx));
});

describe('page ACL comparisons use canonical resource identity', () => {
  it('allows an authorized block edit while unchanged readonly media returns as a resolved URL', async () => {
    const blocks = structuredClone(saved.blocks) as CmsPageBlock[];
    blocks[0].props.src = '/resolved-image.jpg'; blocks[1].props.title = '允许编辑';
    await expect(updateCmsPage(12, { blocks })).resolves.toMatchObject({ blocks: [{ props: { src: 'cms-res://10' } }, { props: { title: '允许编辑' } }] });
    expect(state.acl).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.objectContaining({ id: 'readonly', props: { src: 'cms-res://10' } })]), expect.anything());
    expect(state.sources).toHaveBeenCalled();
  });
  it('still rejects a real change to the readonly block and never persists it', async () => {
    const blocks = structuredClone(saved.blocks) as CmsPageBlock[];
    blocks[0].props.src = '/another-image.jpg';
    await expect(updateCmsPage(12, { blocks })).rejects.toMatchObject({ status: 403 });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.sources).not.toHaveBeenCalled();
  });
});
