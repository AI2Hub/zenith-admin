import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ grants: vi.fn(), revision: vi.fn(), assetVisible: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.grants }) }) }) } }));
vi.mock('./cms-content-revisions.service', () => ({ loadCmsRevision: mocks.revision }));
vi.mock('./cms-asset-rights.service', () => ({ isCmsRevisionAssetVisible: mocks.assetVisible }));
import { config } from '../../config';
import { verifyContentPreviewToken, resolveCmsPreviewRevision } from './cms-preview.service';

const NOW = Date.UTC(2026, 0, 15, 8, 0, 0);
const grantId = '12345678-1234-4234-8234-123456789abc';
const golden = (id: number, rid: number, exp: number) => createHmac('sha256', config.jwtSecret).update(`cms-preview:${id}:${rid}:${grantId}:${exp}`).digest('hex');
describe('CMS immutable revision preview grants', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
  it('binds the signed URL to one revision and a revocable persisted grant', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const exp = NOW / 1000 + 3600;
    mocks.grants.mockResolvedValue([{ expiresAt: new Date(exp * 1000) }]);
    const sig = golden(1001, 27, exp);
    expect(await verifyContentPreviewToken(1001, exp, sig, 27, grantId)).toBe(true);
    expect(await verifyContentPreviewToken(1001, exp, sig, 28, grantId)).toBe(false);
    expect(await verifyContentPreviewToken(1002, exp, sig, 27, grantId)).toBe(false);
    expect(await verifyContentPreviewToken(1001, exp + 1, sig, 27, grantId)).toBe(false);
    expect(await verifyContentPreviewToken(1001, exp, sig)).toBe(false);
    mocks.grants.mockResolvedValue([]);
    expect(await verifyContentPreviewToken(1001, exp, sig, 27, grantId)).toBe(false);
  });
  it('rejects expired or malformed grants before querying storage', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    expect(await verifyContentPreviewToken(1, NOW / 1000 - 1, 'bad', 27, grantId)).toBe(false);
    expect(await verifyContentPreviewToken(1, 1.5, 'bad', 27, grantId)).toBe(false);
    expect(mocks.grants).not.toHaveBeenCalled();
  });
  it('a valid share grant cannot reveal a revision after any media or subtitle right is revoked', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const exp = NOW / 1000 + 3600;
    mocks.grants.mockResolvedValue([{ expiresAt: new Date(exp * 1000) }]);
    const revision = { contentId: 1001, payload: { deletedAt: null }, snapshot: { assetVersions: { '72': 72 } } };
    mocks.revision.mockResolvedValue(revision); mocks.assetVisible.mockResolvedValue(true);
    expect(await resolveCmsPreviewRevision(1001, exp, golden(1001, 27, exp), 27, grantId)).toBe(revision);
    mocks.assetVisible.mockResolvedValue(false);
    expect(await resolveCmsPreviewRevision(1001, exp, golden(1001, 27, exp), 27, grantId)).toBeNull();
    expect(mocks.assetVisible).toHaveBeenCalledWith(revision.snapshot);
  });
});
