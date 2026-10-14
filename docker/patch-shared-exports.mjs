#!/usr/bin/env node
/**
 * 构建后将 @zenith/shared 的 exports/main/types 从 src/*.ts 映射到 dist/*.js 或 *.d.ts，
 * 供纯 Node 加载；产物内的相对导入扩展名由 tsc-alias 处理。
 * 用法：node docker/patch-shared-exports.mjs [shared-pkg-dir]（默认 packages/shared）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pkgDir = resolve(process.argv[2] ?? 'packages/shared');
const pkgPath = join(pkgDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const toDist = (value) => value.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '.js');

pkg.main = toDist(pkg.main);
if (pkg.types) pkg.types = pkg.types.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '.d.ts');
for (const key of Object.keys(pkg.exports)) {
  pkg.exports[key] = toDist(pkg.exports[key]);
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);
console.log(`[patch-shared-exports] ${pkgPath}: exports → dist (${Object.keys(pkg.exports).length} entries)`);
