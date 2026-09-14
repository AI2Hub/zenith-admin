import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 图表桶文件（`@/components/charts`）的导入守卫。
 *
 * 桶文件顶层执行 vchart 主题注册副作用，因此任何页面只要 import 它，无论用到哪几个导出，
 * 打包器都会把 ~2MB（≈600KB gz）的 vendor-visactor 变成该页面 chunk 的静态依赖。
 * 只用统计卡 / 空态 / 卡片壳而不画图的页面必须按文件路径直接导入（`@/components/charts/StatCard` 等），
 * 否则一个无图表页面白拉整套图表库——本测试把这类导入直接标红。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, '../..');

/** 桶文件里不依赖 vchart 的导出：只导入这些名字的文件不该走桶文件 */
const LIGHT_EXPORTS = new Set(['StatCard', 'StatGrid', 'EmptyChart', 'ChartCard']);

const BARREL_IMPORT = /^import\s*(type\s+)?\{([^}]*)\}\s*from\s*'@\/components\/charts'\s*;?/gm;

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) yield full;
  }
}

/** `{ A, B as C, type D }` → 值导入的原始名字（去掉 type 修饰与别名） */
function importedValueNames(specifiers: string): string[] {
  return specifiers
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('type '))
    .map((s) => s.split(/\s+as\s+/)[0].trim());
}

describe('@/components/charts 桶文件导入', () => {
  it('只用 StatCard / StatGrid / EmptyChart / ChartCard 的文件不得 import 桶文件（会静态拖进 vchart）', () => {
    const offenders: string[] = [];
    for (const file of walk(webSrc)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(BARREL_IMPORT)) {
        if (m[1]) continue; // import type：不产生运行时边
        const names = importedValueNames(m[2]);
        if (names.length > 0 && names.every((n) => LIGHT_EXPORTS.has(n))) {
          offenders.push(`${path.relative(webSrc, file).replace(/\\/g, '/')}: { ${names.join(', ')} } → 改为 from '@/components/charts/StatCard'（或对应组件文件）`);
        }
      }
    }
    expect(offenders, `以下文件只用到轻量导出却经桶文件导入：\n${offenders.join('\n')}`).toEqual([]);
  });
});
