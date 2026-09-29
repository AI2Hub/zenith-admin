import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsPagePresets, cmsPagePresetVersions } from '../../db/schema';
import type { CmsPagePresetRow } from '../../db/schema';

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn(), access: vi.fn(), lock: vi.fn(), refs: vi.fn(), canonical: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('./cms-sites.service', () => ({ assertSiteAccess: mocks.access, ensureCmsSiteExists: vi.fn() }));
vi.mock('./cms-site-publish-lock.service', () => ({ lockCmsSiteForMutation: mocks.lock }));
vi.mock('./cms-resource-refs.service', () => ({ canonicalizeCmsResourceContent: mocks.canonical, syncCmsResourceRefs: mocks.refs, resolveCmsResourcePayload: async (value: unknown) => value }));
vi.mock('./cms-page-acl.service', () => ({ decorateCmsPageBlocksBatch: vi.fn() }));
import { getCmsPagePreset, saveCmsPagePresetVersion } from './cms-page-presets.service';

const current: CmsPagePresetRow = { id: 8, siteId: 3, name: '当前组合', description: null, currentVersion: 2, blockCount: 1, createdBy: 1, updatedBy: 1, createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:00:00Z') };
const body = { expectedVersion: 2, name: '新版本', blocks: [{ id: 'hero', type: 'hero' as const, props: { title: '活动', image: '/photo.jpg' } }], parameters: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(undefined);
  mocks.canonical.mockImplementation(async (_tx, _siteId, value) => structuredClone(value));
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [current], for: () => ({ limit: async () => [current] }) }) }) }));
  mocks.update.mockImplementation(() => ({ set: (values: object) => ({ where: () => ({ returning: async () => [{ ...current, ...values }] }) }) }));
  mocks.insert.mockImplementation(() => ({ values: (values: object) => ({ returning: async () => [{ id: 90, ...values }] }) }));
  const tx = { select: mocks.select, update: mocks.update, insert: mocks.insert };
  mocks.transaction.mockImplementation(async (fn: (value: typeof tx) => unknown) => fn(tx));
});

describe('page preset version write concurrency and isolation', () => {
  it('rejects stale CAS before creating a new snapshot or replacing media references', async () => {
    await expect(saveCmsPagePresetVersion(8, { ...body, expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), 3);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.refs).not.toHaveBeenCalled();
  });
  it('appends a version with resource protection without writing any existing page or snapshot', async () => {
    const result = await saveCmsPagePresetVersion(8, body);
    expect(result).toMatchObject({ id: 8, currentVersion: 3, name: '新版本' });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(cmsPagePresets);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(cmsPagePresetVersions);
    expect(mocks.refs).toHaveBeenCalledWith(expect.anything(), 'page_preset_version', 90, 3, expect.objectContaining({ presetId: 8, version: 3, blocks: body.blocks }));
    expect(current.currentVersion).toBe(2);
  });
  it('blocks inaccessible site reads before loading version content', async () => {
    mocks.access.mockRejectedValue(new Error('无本站权限'));
    await expect(getCmsPagePreset(8)).rejects.toThrow('无本站权限');
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
