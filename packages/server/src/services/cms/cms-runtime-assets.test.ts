import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CmsDeploymentSnapshot, CmsSiteRow } from '../../db/schema';
import { withCmsGenerationContext } from './cms-generation-context';
import { newCmsBuildPerformance, withCmsBuildContext } from './cms-build-context';
import { ensureSiteIslandsAsset, ensureSiteThemeCssAsset } from './cms-render.service';
import { collectCmsGenerationArtifacts, verifyCmsGenerationArtifacts } from './cms-generation-storage.service';

const fixture = vi.hoisted(() => {
  const previous = process.env.CMS_STATIC_ROOT;
  const root = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/cms-generation-assets-${process.pid}-${Date.now()}`;
  process.env.CMS_STATIC_ROOT = root;
  return { previous, root };
});
vi.mock('../../cms/themes/islands-asset', () => ({ getIslandsAsset: async () => ({ relPath: '_assets/islands.new-runtime.js', hash: 'new-runtime', js: 'window.cmsRuntime = 2;' }) }));

const site = { id: 15, code: 'qa-immutable-assets', theme: 'default', settings: {} } as CmsSiteRow;
const generationDirectory = (id: number) => path.join(fixture.root, site.code, `generation-${id}`);
const snapshot = (artifacts: NonNullable<CmsDeploymentSnapshot['artifacts']>): CmsDeploymentSnapshot => ({ siteCode: site.code, tables: {}, revisions: [], sitePublicRevision: 1, createdAt: '2026-09-30T00:00:00.000Z', artifacts });

afterAll(async () => {
  const relative = path.relative(os.tmpdir(), path.resolve(fixture.root));
  if (relative.startsWith('cms-generation-assets-') && !relative.includes(path.sep)) await fs.rm(fixture.root, { recursive: true, force: true });
  if (fixture.previous === undefined) delete process.env.CMS_STATIC_ROOT;
  else process.env.CMS_STATIC_ROOT = fixture.previous;
});

describe('CMS runtime assets preserve immutable generations', () => {
  it.each([false, true])('returns current runtime bytes without changing a sealed generation (candidate preview: %s)', async candidate => {
    const generationId = candidate ? 902 : 901;
    const directory = generationDirectory(generationId);
    await fs.mkdir(path.join(directory, '_assets'), { recursive: true });
    await fs.writeFile(path.join(directory, '_assets/islands.old.js'), 'window.cmsRuntime = 1;');
    const sealed = snapshot(await collectCmsGenerationArtifacts(site.code, generationId));
    const [css, islands] = await withCmsGenerationContext({ siteId: site.id, generationId, candidate }, () => Promise.all([ensureSiteThemeCssAsset(site), ensureSiteIslandsAsset(site)]));
    expect(css.css.length).toBeGreaterThan(0);
    expect(islands.js).toBe('window.cmsRuntime = 2;');
    expect(await fs.readdir(path.join(directory, '_assets'))).toEqual(['islands.old.js']);
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).resolves.toBeUndefined();
  });

  it('still persists both assets during an actual frozen candidate build', async () => {
    const generationId = 903;
    const [css, islands] = await withCmsBuildContext(site.id, generationId, newCmsBuildPerformance(1), () =>
      withCmsGenerationContext({ siteId: site.id, generationId, candidate: true, buildAt: new Date('2026-09-30T00:00:00Z') }, () => Promise.all([ensureSiteThemeCssAsset(site), ensureSiteIslandsAsset(site)])));
    expect(await fs.readFile(path.join(generationDirectory(generationId), css.relPath), 'utf8')).toBe(css.css);
    expect(await fs.readFile(path.join(generationDirectory(generationId), islands.relPath), 'utf8')).toBe(islands.js);
    const sealed = snapshot(await collectCmsGenerationArtifacts(site.code, generationId));
    expect(sealed.artifacts).toHaveLength(2);
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).resolves.toBeUndefined();
  });

  it('keeps exact manifest enforcement and returns an actionable conflict for extra, modified or missing artifacts', async () => {
    const generationId = 904;
    const directory = generationDirectory(generationId);
    await fs.mkdir(directory, { recursive: true });
    const original = path.join(directory, 'index.html');
    await fs.writeFile(original, 'sealed public page');
    const sealed = snapshot(await collectCmsGenerationArtifacts(site.code, generationId));
    await fs.writeFile(path.join(directory, 'extra.js'), 'extra runtime file');
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).rejects.toMatchObject({ status: 409 });
    await fs.unlink(path.join(directory, 'extra.js'));
    await fs.writeFile(original, 'modified public page');
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).rejects.toMatchObject({ status: 409 });
    await fs.writeFile(original, 'sealed public page');
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).resolves.toBeUndefined();
    await fs.unlink(original);
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).rejects.toMatchObject({ status: 409 });
    await fs.rmdir(directory);
    await expect(verifyCmsGenerationArtifacts(generationId, sealed)).rejects.toMatchObject({ status: 409 });
    await expect(verifyCmsGenerationArtifacts(generationId, snapshot([]))).rejects.toMatchObject({ status: 409 });
  });
});
