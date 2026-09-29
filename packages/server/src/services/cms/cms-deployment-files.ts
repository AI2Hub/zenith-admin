import fs from 'node:fs/promises';
import path from 'node:path';
import { createCmsSiteSchema } from '@zenith/shared/cms';
import { CMS_STATIC_ROOT, isStrictlyWithin } from './cms-static-path';

export function cmsDeploymentDirectory(siteCode: string, deploymentId: number, root = CMS_STATIC_ROOT): string {
  if (!createCmsSiteSchema.shape.code.safeParse(siteCode).success || !Number.isSafeInteger(deploymentId) || deploymentId <= 0) throw new Error('部署存储标识无效');
  const site = path.resolve(root, siteCode); const directory = path.resolve(site, `generation-${deploymentId}`);
  if (!isStrictlyWithin(root, site) || !isStrictlyWithin(site, directory)) throw new Error('部署存储目录越界');
  return directory;
}
async function rejectLink(candidate: string) {
  try { if ((await fs.lstat(candidate)).isSymbolicLink()) throw new Error('部署存储包含符号链接或目录联接，请先检查存储目录'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
/** Reject symlinks at every level before either measuring or removing a generated directory. */
export async function inspectCmsDeploymentDirectory(siteCode: string, deploymentId: number, options?: { root?: string; checkCancelled?: () => Promise<void> }) {
  const root = options?.root ?? CMS_STATIC_ROOT; const directory = cmsDeploymentDirectory(siteCode, deploymentId, root);
  await rejectLink(root); await rejectLink(path.dirname(directory)); await rejectLink(directory);
  let bytes = 0; let files = 0;
  const walk = async (folder: string): Promise<void> => {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const target = path.resolve(folder, entry.name);
      if (!isStrictlyWithin(directory, target)) throw new Error('部署产物目录越界');
      if (entry.isSymbolicLink()) throw new Error('部署产物包含符号链接或目录联接');
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) { const stat = await fs.lstat(target); if (stat.isSymbolicLink()) throw new Error('部署产物在检查期间发生变化'); bytes += stat.size; files++; if (files % 250 === 0) await options?.checkCancelled?.(); }
    }
  };
  await walk(directory); return { directory, bytes, files };
}
export async function removeCmsDeploymentDirectory(siteCode: string, deploymentId: number, checkCancelled?: () => Promise<void>) {
  const inspected = await inspectCmsDeploymentDirectory(siteCode, deploymentId, { checkCancelled });
  await checkCancelled?.();
  // The absolute target was validated against the configured root and every child was checked above.
  await fs.rm(inspected.directory, { recursive: true, force: true });
  return inspected;
}
