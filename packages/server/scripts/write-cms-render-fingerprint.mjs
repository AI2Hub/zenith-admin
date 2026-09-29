// Preserve the renderer boundary when a deployment subsequently bundles the server entrypoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeCmsRenderRuntimeHash } from '../dist/services/cms/cms-render-runtime.js';

const services = path.resolve('dist/services/cms');
const output = path.resolve('dist/cms/renderer-fingerprint.json');
const hash = await computeCmsRenderRuntimeHash(services);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ version: 1, hash }) + '\n');
console.log('[cms-render-fingerprint] 已生成独立 CMS 渲染指纹');
