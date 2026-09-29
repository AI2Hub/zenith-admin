import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CMS_STATIC_ROOT, isStrictlyWithin, pathToStaticFile } from './cms-static-path';
import { signCmsTelemetryPage, verifyCmsTelemetryPageToken } from './cms-telemetry-context';
import { memoCmsBuild } from './cms-build-context';

export interface CmsBuildArtifact { path: string; checksum: string; size: number }
export interface CmsBuildTarget { key: string; fingerprint: string; artifacts: CmsBuildArtifact[] }
export interface CmsBuildContentDependencies { collections: string; details: ReadonlyMap<number, string> }

/** Compare checkpoints with the freshly re-read manifest; no second read of every file is needed. */
export function cmsBuildTargetMatchesManifest(target: CmsBuildTarget, manifest: ReadonlyMap<string, CmsBuildArtifact>): boolean {
  return target.artifacts.every(expected => {
    const actual = manifest.get(expected.path);
    return actual?.checksum === expected.checksum && actual.size === expected.size;
  });
}

export function cmsBuildDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Reuse mkdir work only. Symlink and containment validation still runs on every artifact access. */
export function ensureCmsBuildArtifactDirectory(filename: string): Promise<void> {
  const directory = path.dirname(filename);
  return memoCmsBuild(`artifact-directory:${directory}`, async () => { await fs.mkdir(directory, { recursive: true }); });
}

/** Changes outside an independent page invalidate all pages, including navigation and collections. */
export function cmsBuildTargetFingerprint(globalHash: string, key: string, pages: ReadonlyMap<number, string>, frozenAt?: string, contents?: CmsBuildContentDependencies): string {
  const [scope, phase, id] = key.split('|');
  const contentDependency = contents ? scope === '~site' && phase === '2' ? contents.details.get(Number(id)) ?? null : contents.collections : null;
  return cmsBuildDigest([globalHash, key, contentDependency, scope === '~site' && phase === '4' ? pages.get(Number(id)) ?? null : null, scope === '~meta' ? frozenAt ?? null : null]);
}

export function rebindCmsArtifactAttribution(html: string, releaseId: number, deploymentId: number): string {
  html = html.replace(/(<meta\b[^>]*\bname=["']cms-telemetry-context["'][^>]*\bcontent=["'])([^"']*)(["'][^>]*>)/gi, (tag, before: string, token: string, after: string) => {
    const page = verifyCmsTelemetryPageToken(token);
    return page ? `${before}${signCmsTelemetryPage({ ...page, releaseId, deploymentId }).contextToken}${after}` : tag;
  });
  for (const [name, value] of [['cms-release-id', releaseId], ['cms-deployment-id', deploymentId]] as const) {
    html = html.replace(new RegExp(`(<meta\\b[^>]*\\bname=["']${name}["'][^>]*\\bcontent=["'])[^"']*(["'][^>]*>)`, 'gi'), (_tag, before: string, after: string) => `${before}${value}${after}`);
  }
  return html;
}

/** Every read/write rejects symbolic links, including intermediate site/generation directories. */
export async function cmsBuildArtifactFile(siteCode: string, generationId: number, relative: string, root = CMS_STATIC_ROOT): Promise<string> {
  if (!/^[a-z0-9][a-z0-9_-]{0,49}$/i.test(siteCode) || !Number.isSafeInteger(generationId) || generationId <= 0) throw new Error('Invalid CMS artifact scope');
  const generationRoot = path.resolve(root, siteCode, `generation-${generationId}`);
  const filename = path.resolve(generationRoot, pathToStaticFile(relative));
  if (!isStrictlyWithin(generationRoot, filename) || !isStrictlyWithin(root, generationRoot)) throw new Error('Invalid CMS artifact path');
  let current = path.resolve(root);
  for (const segment of path.relative(root, filename).split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('CMS artifact paths cannot contain symbolic links');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return filename;
}

export async function inspectCmsBuildArtifacts(siteCode: string, generationId: number, paths: readonly string[], root = CMS_STATIC_ROOT): Promise<CmsBuildArtifact[]> {
  const artifacts: CmsBuildArtifact[] = [];
  for (const relative of [...new Set(paths)].sort((a, b) => a.localeCompare(b))) {
    const bytes = await fs.readFile(await cmsBuildArtifactFile(siteCode, generationId, relative, root));
    artifacts.push({ path: relative, checksum: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
  }
  return artifacts;
}

export async function validateCmsBuildTarget(siteCode: string, generationId: number, target: CmsBuildTarget, root = CMS_STATIC_ROOT): Promise<boolean> {
  try {
    const actual = await inspectCmsBuildArtifacts(siteCode, generationId, target.artifacts.map((artifact) => artifact.path), root);
    const expected = [...target.artifacts].sort((a, b) => a.path.localeCompare(b.path));
    return actual.length === expected.length && actual.every((artifact, index) => artifact.path === expected[index].path && artifact.size === expected[index].size && artifact.checksum === expected[index].checksum);
  } catch { return false; }
}

/** Copy bytes only after verifying the immutable base; never hard-link a public generation. */
export async function reuseCmsBuildTarget(input: { siteCode: string; sourceGenerationId: number; generationId: number; releaseId: number; target: CmsBuildTarget; assertCurrent: () => Promise<void>; root?: string }): Promise<CmsBuildArtifact[] | null> {
  const output: CmsBuildArtifact[] = [];
  for (const artifact of input.target.artifacts) {
    let bytes: Buffer;
    try { bytes = await fs.readFile(await cmsBuildArtifactFile(input.siteCode, input.sourceGenerationId, artifact.path, input.root)); } catch { return null; }
    if (bytes.length !== artifact.size || createHash('sha256').update(bytes).digest('hex') !== artifact.checksum) return null;
    if (artifact.path.endsWith('.html')) bytes = Buffer.from(rebindCmsArtifactAttribution(bytes.toString('utf8'), input.releaseId, input.generationId));
    const destination = await cmsBuildArtifactFile(input.siteCode, input.generationId, artifact.path, input.root);
    await ensureCmsBuildArtifactDirectory(destination);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes);
      await input.assertCurrent();
      await fs.rename(temporary, destination);
    } finally { await fs.rm(temporary, { force: true }); }
    output.push({ path: artifact.path, checksum: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
  }
  return output.sort((a, b) => a.path.localeCompare(b.path));
}
