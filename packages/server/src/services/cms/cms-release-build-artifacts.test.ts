import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { cmsBuildArtifactFile, cmsBuildTargetFingerprint, cmsBuildTargetMatchesManifest, inspectCmsBuildArtifacts, rebindCmsArtifactAttribution, reuseCmsBuildTarget, validateCmsBuildTarget } from './cms-release-build-artifacts';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-release-artifacts-')); roots.push(root);
  const filename = await cmsBuildArtifactFile('example', 1, 'news/1.html', root);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, '<meta name="cms-release-id" content="3"/><meta name="cms-deployment-id" content="1"/><h1>Approved</h1>');
  const target = { key: '~site|2|000000000001', fingerprint: 'frozen-input', artifacts: await inspectCmsBuildArtifacts('example', 1, ['news/1.html'], root) };
  return { root, filename, target };
}

describe('CMS durable build artifacts', () => {
  it('validates checkpoints against the final freshly read manifest without trusting missing or changed files', () => {
    const target = { key: 'one', fingerprint: 'fixed', artifacts: [{ path: 'one.html', size: 12, checksum: 'abc' }] };
    expect(cmsBuildTargetMatchesManifest(target, new Map([['one.html', { ...target.artifacts[0] }]]))).toBe(true);
    expect(cmsBuildTargetMatchesManifest(target, new Map())).toBe(false);
    expect(cmsBuildTargetMatchesManifest(target, new Map([['one.html', { ...target.artifacts[0], checksum: 'changed' }]]))).toBe(false);
  });
  it('validates disk bytes on resume, including reordered JSONB keys, and detects truncation', async () => {
    const { root, filename, target } = await fixture();
    const reordered = { ...target, artifacts: target.artifacts.map((a) => ({ size: a.size, checksum: a.checksum, path: a.path })) };
    expect(await validateCmsBuildTarget('example', 1, reordered, root)).toBe(true);
    await fs.writeFile(filename, 'partial');
    expect(await validateCmsBuildTarget('example', 1, target, root)).toBe(false);
  });
  it('reuses only verified bytes, changes attribution and leaves the public base immutable', async () => {
    const { root, filename, target } = await fixture();
    const before = await fs.readFile(filename, 'utf8');
    const artifacts = await reuseCmsBuildTarget({ root, siteCode: 'example', sourceGenerationId: 1, generationId: 2, releaseId: 4, visibilityEpoch: 7, target, assertCurrent: async () => {} });
    expect(artifacts).not.toBeNull();
    const copied = await fs.readFile(await cmsBuildArtifactFile('example', 2, 'news/1.html', root), 'utf8');
    expect(copied).toContain('name="cms-release-id" content="4"');
    expect(copied).toContain('name="cms-deployment-id" content="2"');
    expect(copied).toContain('name="cms-generation-id" content="2"');
    expect(copied).toContain('name="cms-visibility-epoch" content="7"');
    expect(await fs.readFile(filename, 'utf8')).toBe(before);
    expect(artifacts![0].checksum).not.toBe(target.artifacts[0].checksum);
    await fs.writeFile(filename, 'corrupted base');
    expect(await reuseCmsBuildTarget({ root, siteCode: 'example', sourceGenerationId: 1, generationId: 3, releaseId: 5, target, assertCurrent: async () => {} })).toBeNull();
  });
  it('checks dispatch ownership before publishing each reused file', async () => {
    const { root, target } = await fixture();
    await expect(reuseCmsBuildTarget({ root, siteCode: 'example', sourceGenerationId: 1, generationId: 2, releaseId: 4, target, assertCurrent: async () => { throw new Error('dispatch replaced'); } })).rejects.toThrow('dispatch replaced');
    await expect(fs.access(await cmsBuildArtifactFile('example', 2, 'news/1.html', root))).rejects.toThrow();
    expect(await fs.readdir(path.join(root, 'example/generation-2/news'))).toEqual([]);
  });
  it('rejects traversal and symlink ancestors before reading or writing artifacts', async () => {
    const { root } = await fixture();
    for (const invalid of ['../public.html', 'news/../../public.html', 'C:/secret', '//other/share']) await expect(cmsBuildArtifactFile('example', 1, invalid, root)).rejects.toThrow();
    const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-release-outside-')); roots.push(elsewhere);
    await fs.symlink(elsewhere, path.join(root, 'example/generation-3'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(cmsBuildArtifactFile('example', 3, 'index.html', root)).rejects.toThrow('symbolic links');
  });
  it('invalidates global dependencies and only the independently edited page when the global closure is stable', () => {
    const first = new Map([[8, 'page-a'], [9, 'page-b']]); const changed = new Map([[8, 'page-a-new'], [9, 'page-b']]);
    const fingerprint = (global: string, key: string, pages = first) => cmsBuildTargetFingerprint(global, key, pages, '2026-09-25T12:00:00Z');
    expect(fingerprint('stable', '~site|4|000000000008', changed)).not.toBe(fingerprint('stable', '~site|4|000000000008'));
    expect(fingerprint('stable', '~site|4|000000000009', changed)).toBe(fingerprint('stable', '~site|4|000000000009'));
    for (const key of ['~site|0|000000000000', '~site|1|000000000002', '~site|2|000000000003', '~site|3|000000000004', '~meta|0|000000000001']) expect(fingerprint('changed-global', key)).not.toBe(fingerprint('stable', key));
    expect(cmsBuildTargetFingerprint('stable', '~meta|0|000000000001', first, 'later')).not.toBe(fingerprint('stable', '~meta|0|000000000001'));
    expect(rebindCmsArtifactAttribution('<p>cms-release-id</p>', 3, 4)).toContain('<p>cms-release-id</p>');
  });
  it('keeps unrelated default details when one body changes, while collection metadata and slots invalidate their consumers', () => {
    const pages = new Map<number, string>();
    const first = { collections: 'same-displayed-summary', details: new Map([[1, 'body-before'], [2, 'other-detail']]) };
    const changedBody = { collections: first.collections, details: new Map([[1, 'body-after'], [2, 'other-detail']]) };
    const key = (id: number) => `~site|2|${String(id).padStart(12, '0')}`;
    const fingerprint = (target: string, contents = first, global = 'structure-links-and-resolved-slots') => cmsBuildTargetFingerprint(global, target, pages, 'fixed-clock', contents);
    expect(fingerprint(key(1), changedBody)).not.toBe(fingerprint(key(1)));
    expect(fingerprint(key(2), changedBody)).toBe(fingerprint(key(2)));
    expect(fingerprint('~site|0|000000000000', changedBody)).toBe(fingerprint('~site|0|000000000000'));
    const changedExcerpt = { ...changedBody, collections: 'changed-fallback-excerpt' };
    expect(fingerprint('~site|0|000000000000', changedExcerpt)).not.toBe(fingerprint('~site|0|000000000000'));
    expect(fingerprint(key(2), changedExcerpt)).toBe(fingerprint(key(2)));
    expect(fingerprint(key(2), changedExcerpt, 'changed-widget-displayed-summary')).not.toBe(fingerprint(key(2)));
  });
});
