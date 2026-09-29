import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { cmsDeploymentDirectory, inspectCmsDeploymentDirectory } from './cms-deployment-files';

describe('deployment storage filesystem boundary', () => {
  it.each(['../other', '..', 'a/b', 'C:\\Windows', '//server/share', 'valid/../../other'])('rejects unsafe site code %s before touching disk', code => {
    expect(() => cmsDeploymentDirectory(code, 2)).toThrow('部署存储标识无效');
  });
  it('counts only the chosen generation and rejects a junction/symlink escape', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'cms-retention-files-'));
    try {
      const own = cmsDeploymentDirectory('qa-files', 123, root); const sibling = cmsDeploymentDirectory('qa-files', 124, root);
      await fs.mkdir(own, { recursive: true }); await fs.mkdir(sibling, { recursive: true });
      await fs.writeFile(path.join(own, 'index.html'), '12345'); await fs.writeFile(path.join(sibling, 'keep.html'), 'keep');
      expect(await inspectCmsDeploymentDirectory('qa-files', 123, { root })).toMatchObject({ bytes: 5, files: 1 });
      await fs.symlink(sibling, path.join(own, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
      await expect(inspectCmsDeploymentDirectory('qa-files', 123, { root })).rejects.toThrow('符号链接或目录联接');
      expect(await fs.readFile(path.join(sibling, 'keep.html'), 'utf8')).toBe('keep');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
