/**
 * Artifact-layer baseline, not an end-to-end renderer benchmark.
 * Run after final validation: npx tsx packages/server/scripts/benchmark-cms-release-artifacts.ts
 * Optional --output <absolute-file.json>; generated evidence belongs outside the repository.
 * Uses only a temporary filesystem tree and the production checksum/reuse/resume helpers.
 */
import '../src/lib/fatal-handlers';
import '@hono/zod-openapi';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmsBuildArtifactFile, cmsBuildTargetFingerprint, inspectCmsBuildArtifacts, reuseCmsBuildTarget, validateCmsBuildTarget, type CmsBuildTarget } from '../src/services/cms/cms-release-build-artifacts';

const outputFlag = process.argv.indexOf('--output');
const output = outputFlag < 0 ? null : process.argv[outputFlag + 1];
if (outputFlag >= 0 && (!output || !path.isAbsolute(output))) throw new Error('--output requires an absolute path outside the repository');
if (output && !path.relative(process.cwd(), output).startsWith('..')) throw new Error('Write benchmark evidence outside the repository');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-release-baseline-'));
const results: Array<Record<string, unknown>> = [];
const payload = '<article><h1>Frozen publication benchmark</h1>' + '<p>Deterministic approved content and frozen dependencies.</p>'.repeat(128) + '</article>';
const current = async () => {};
try {
  for (const count of [1000, 10000]) {
    const siteCode = `baseline-${count}`;
    const inputs = new Map(Array.from({ length: count }, (_, index) => [index + 1, `page-${index + 1}`]));
    const manifest = new Map<string, CmsBuildTarget>();
    const firstStarted = performance.now();
    for (let id = 1; id <= count; id++) {
      const key = `~site|4|${String(id).padStart(12, '0')}`;
      const relative = `pages/${id}.html`;
      const file = await cmsBuildArtifactFile(siteCode, 1, relative, root);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `<meta name="cms-release-id" content="1"/><meta name="cms-deployment-id" content="1"/>${payload}`);
      manifest.set(key, { key, fingerprint: cmsBuildTargetFingerprint('frozen-global', key, inputs), artifacts: await inspectCmsBuildArtifacts(siteCode, 1, [relative], root) });
    }
    const fullMs = performance.now() - firstStarted;
    const reused = new Map<string, CmsBuildTarget>();
    const changed = new Map(inputs); changed.set(1, 'edited-independent-page');
    const incrementalStarted = performance.now();
    for (const [key, target] of manifest) {
      const fingerprint = cmsBuildTargetFingerprint('frozen-global', key, changed);
      if (fingerprint === target.fingerprint) {
        const artifacts = await reuseCmsBuildTarget({ root, siteCode, sourceGenerationId: 1, generationId: 2, releaseId: 2, target, assertCurrent: current });
        if (!artifacts) throw new Error('Unexpected artifact mismatch');
        reused.set(key, { key, fingerprint, artifacts });
      } else {
        const file = await cmsBuildArtifactFile(siteCode, 2, target.artifacts[0].path, root);
        await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, payload + '<p>Edited</p>');
        reused.set(key, { key, fingerprint, artifacts: await inspectCmsBuildArtifacts(siteCode, 2, [target.artifacts[0].path], root) });
      }
    }
    const incrementalMs = performance.now() - incrementalStarted;
    // A process stopped after half of its completed target records were committed.
    const half = Math.floor(count / 2);
    const resumeStarted = performance.now();
    let validated = 0;
    for (const target of [...reused.values()].slice(0, half)) {
      if (!await validateCmsBuildTarget(siteCode, 2, target, root)) throw new Error('Resume rejected intact files');
      validated++;
    }
    const resumeValidationMs = performance.now() - resumeStarted;
    const first = [...reused.values()][0];
    await fs.writeFile(await cmsBuildArtifactFile(siteCode, 2, first.artifacts[0].path, root), 'truncated');
    const corruptRejected = !await validateCmsBuildTarget(siteCode, 2, first, root);
    if (!corruptRejected) throw new Error('Corrupt checkpoint was accepted');
    results.push({ targets: count, payloadBytes: Buffer.byteLength(payload), fullArtifactWriteMs: Math.round(fullMs), incrementalCopyMs: Math.round(incrementalMs), regeneratedTargets: 1, reusedTargets: count - 1, resumeValidatedTargets: validated, resumeValidationMs: Math.round(resumeValidationMs), corruptRejected, peakRssMb: Math.ceil(process.resourceUsage().maxRSS / 1024) });
    process.stderr.write(`Measured ${count} artifact targets\n`);
  }
  const evidence = JSON.stringify({ measuredAt: new Date().toISOString(), scope: 'artifact-layer-only; excludes database queries, search indexing and React rendering', node: process.version, platform: process.platform, results }, null, 2) + '\n';
  if (output) { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, evidence); }
  process.stdout.write(evidence);
} finally { await fs.rm(root, { recursive: true, force: true }); }
