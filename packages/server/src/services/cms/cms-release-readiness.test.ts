import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsContentRevisionSnapshotSchema, type CmsModelField } from '@zenith/shared/cms';
import { cmsContentRevisionApprovals, cmsModelVersions, type CmsReleaseRow } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

const mocks = vi.hoisted(() => ({ globalSelect: vi.fn(() => { throw new Error('Global database access inside readiness'); }), loadRevision: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: mocks.globalSelect } }));
vi.mock('./cms-generation-storage.service', () => ({ cmsGenerationSchemaName: (id: number) => `generation_${id}`, readCmsGenerationConfigurationRows: vi.fn(async () => []) }));
vi.mock('./cms-deployment-storage-state', () => ({ assertCmsDeploymentStorageAvailable: vi.fn() }));
vi.mock('./cms-content-revisions.service', () => ({ loadCmsRevision: mocks.loadRevision, loadCmsPublishableRevision: vi.fn(), canonicalCmsJson: JSON.stringify }));
vi.mock('./cms-design-versions.service', () => ({ cmsSnapshotHash: JSON.stringify }));
vi.mock('./cms-content-access.service', () => ({ requireCmsContentsAccess: vi.fn() }));
vi.mock('./cms-channels.service', () => ({ assertChannelAccess: vi.fn() }));
vi.mock('./cms-asset-rights.service', () => ({ isCmsRevisionAssetVisible: vi.fn() }));

import { inspectCmsReleaseReadiness } from './cms-release-readiness.service';

function fixture(fields: CmsModelField[], approved = true) {
  const data = new Map<unknown, unknown[]>([[cmsModelVersions, [{ fields, ownerSiteId: null }]], [cmsContentRevisionApprovals, approved ? [{ hash: 'approved-hash' }] : []]]);
  const query = (table: unknown) => {
    const rows = data.get(table) ?? [];
    const builder = { innerJoin: () => builder, where: () => builder, limit: async () => rows, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return builder;
  };
  const executor = { select: () => ({ from: query }), execute: async () => [] } as unknown as DbExecutor;
  const release = { id: 8, siteId: 2, name: '准备上线', activateAt: null, timeZone: 'Asia/Shanghai', baseGenerationId: null,
    items: [{ contentId: 4, revisionId: 7, title: '产品', action: 'publish' }], configurationItems: [],
    configurationSnapshot: { replaceAll: [], tables: { cms_channels: [{ id: 3, parent_id: 0, status: 'enabled' }] } },
  } as unknown as CmsReleaseRow;
  return { executor, release };
}

beforeEach(() => { mocks.globalSelect.mockClear(); mocks.loadRevision.mockReset(); });
describe('CMS readiness fixed input transaction', () => {
  it('reads immutable model fields through the supplied executor and reports every nested unique collision', async () => {
    const fields = [{ id: 1, name: 'cards', label: '卡片', fieldType: 'array', configuration: { fields: [{ name: 'sku', label: 'SKU', fieldType: 'text', configuration: { unique: true } }] } }] as CmsModelField[];
    const { executor, release } = fixture(fields);
    const snapshot = cmsContentRevisionSnapshotSchema.parse({ channelId: 3, title: '产品', modelId: 5, modelVersionId: 6, extend: { cards: [{ _id: 'a', sku: 'duplicate' }, { _id: 'b', sku: 'duplicate' }] } });
    mocks.loadRevision.mockResolvedValue({ id: 7, contentId: 4, siteId: 2, hash: 'approved-hash', snapshot, payload: {} });
    const result = await inspectCmsReleaseReadiness(executor, release);
    expect(result.checks.filter(check => check.code === 'model-unique').map(check => check.fieldPath)).toEqual(['extend.cards.0.sku', 'extend.cards.1.sku']);
    expect(result.checks.some(check => check.code === 'model-version')).toBe(false);
    expect(result.validation.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.globalSelect).not.toHaveBeenCalled();
  });

  it('keeps approval, model, asset and expiry failures in one response', async () => {
    const { executor, release } = fixture([], false);
    const snapshot = cmsContentRevisionSnapshotSchema.parse({ channelId: 3, title: '产品', modelId: 5, modelVersionId: null, expireAt: '2020-01-01 00:00:00', assetVersions: { 9: 10 } });
    mocks.loadRevision.mockResolvedValue({ id: 7, contentId: 4, siteId: 2, hash: 'approved-hash', snapshot, payload: {} });
    const result = await inspectCmsReleaseReadiness(executor, release);
    expect(result.checks.map(check => check.code)).toEqual(expect.arrayContaining(['approval', 'model-version', 'asset-rights', 'content-expiry']));
    expect(mocks.globalSelect).not.toHaveBeenCalled();
  });
});
