import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CMS_RENDER_RUNTIME_MODULES, CMS_RENDER_NON_OUTPUT_DEPENDENCIES, cmsRenderRuntimeHashFromEntry, computeCmsRenderRuntimeHash, isCmsRenderRuntimeFile, isCmsSharedRenderFile } from './cms-render-runtime';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe('CMS render runtime fingerprint boundary', () => {
  it('includes theme render dependencies and excludes statistics, workflow and worker-only services', () => {
    for (const file of ['cms-render.service.ts', 'cms-contents-query.service.js', 'cms-frozen-media.ts', 'cms-telemetry-context.js']) expect(isCmsRenderRuntimeFile(file)).toBe(true);
    for (const file of ['cms-stats-query.ts', 'cms-editorial-outcomes.service.js', 'cms-media-engine.ts', 'cms-release-build.service.ts', 'cms-render.service.test.ts']) expect(isCmsRenderRuntimeFile(file)).toBe(false);
  });
  it('requires direct runtime dependencies of the renderer to stay in its fingerprint boundary', async () => {
    const source = await fs.readFile(new URL('./cms-render.service.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/\bimport\s+(?!type\b)[^;]*?\bfrom\s+['"]\.\/(cms-[^'"]+)['"]/g)].map(match => match[1]);
    for (const name of imports) expect(isCmsRenderRuntimeFile(`${name}.ts`), name).toBe(true);
  });
  it('makes additions to the transitive read-module imports explicit instead of silently omitting a render dependency', async () => {
    for (const name of CMS_RENDER_RUNTIME_MODULES) {
      const source = await fs.readFile(new URL(`./${name}.ts`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/\bimport\s+(?!type\b)[^;]*?\bfrom\s+['"]\.\/(cms-[^'"]+)['"]/g)].map(match => match[1]);
      for (const dependency of imports) expect(CMS_RENDER_RUNTIME_MODULES.has(dependency) || CMS_RENDER_NON_OUTPUT_DEPENDENCIES.has(dependency), `${name} -> ${dependency}`).toBe(true);
    }
  });
  it('omits shared reporting and editorial contracts while retaining rendering schemas', () => {
    for (const file of ['stats.js', 'editorial-outcomes.js', 'operations.js', 'reviews.js', 'release-build.js']) expect(isCmsSharedRenderFile(file)).toBe(false);
    for (const file of ['site-composition.js', 'telemetry.js', 'forms.js', 'model-design.js']) expect(isCmsSharedRenderFile(file)).toBe(true);
  });
  it('keeps source hashes stable for backend/report changes and invalidates changed renderer code', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-runtime-source-')); roots.push(root);
    const services = path.join(root, 'services/cms'); const shared = path.join(root, 'shared/cms');
    await Promise.all([services, shared, path.join(root, 'cms'), path.join(root, 'lib'), path.join(root, 'shared/core')].map(directory => fs.mkdir(directory, { recursive: true })));
    await fs.writeFile(path.join(services, 'cms-render.service.js'), 'renderer one');
    const original = await computeCmsRenderRuntimeHash(services, shared);
    await fs.writeFile(path.join(services, 'cms-stats-query.js'), 'new backend analytics logic');
    await fs.writeFile(path.join(shared, 'editorial-outcomes.js'), 'new editorial behavior');
    expect(await computeCmsRenderRuntimeHash(services, shared)).toBe(original);
    await fs.writeFile(path.join(services, 'cms-render.service.js'), 'renderer two');
    expect(await computeCmsRenderRuntimeHash(services, shared)).not.toBe(original);
  });
  it('uses a packaged renderer digest across backend-only bundles and includes actual asset bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-runtime-bundle-')); roots.push(root);
    const assets = path.join(root, 'cms'); await fs.mkdir(assets);
    const entry = path.join(root, 'server.mjs'); await fs.writeFile(entry, 'backend bundle one');
    await fs.writeFile(path.join(assets, 'renderer-fingerprint.json'), JSON.stringify({ version: 1, hash: 'a'.repeat(64) }));
    await fs.writeFile(path.join(assets, 'theme.css'), 'body{color:red}');
    const original = await cmsRenderRuntimeHashFromEntry(entry);
    await fs.writeFile(entry, 'backend bundle two'); expect(await cmsRenderRuntimeHashFromEntry(entry)).toBe(original);
    await fs.writeFile(path.join(assets, 'theme.css'), 'body{color:blue}'); expect(await cmsRenderRuntimeHashFromEntry(entry)).not.toBe(original);
    await fs.rm(path.join(assets, 'renderer-fingerprint.json'));
    const conservative = await cmsRenderRuntimeHashFromEntry(entry);
    await fs.writeFile(entry, 'backend bundle three'); expect(await cmsRenderRuntimeHashFromEntry(entry)).not.toBe(conservative);
  });
});
