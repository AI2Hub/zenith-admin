import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { explicitCrudRoutes, type ExplicitCrudEntry } from './_crud-explicit';

/**
 * 标准操作路由必须经 `mountCrud` 派生：显式 `defineContractRoute(xxxContract.list | detail | create | update | remove | removeBatch, …)`
 * 只允许出现在 `_crud-explicit.ts` 登记过的位置，且登记表只准缩小。
 */
const ROUTES_DIR = __dirname;
const STD = new Set(['list', 'detail', 'create', 'update', 'remove', 'removeBatch']);

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full));
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 文件 → 契约变量 → 显式书写的标准操作 */
function scanExplicitBlocks(): Map<string, Map<string, string[]>> {
  const result = new Map<string, Map<string, string[]>>();
  for (const file of listRouteFiles(ROUTES_DIR)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('defineContractRoute(')) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const rel = relative(ROUTES_DIR, file).replace(/\\/g, '/');
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineContractRoute') {
        const target = node.arguments[0];
        if (target && ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) && STD.has(target.name.text)) {
          const byContract = result.get(rel) ?? new Map<string, string[]>();
          const ops = byContract.get(target.expression.text) ?? [];
          ops.push(target.name.text);
          byContract.set(target.expression.text, ops);
          result.set(rel, byContract);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return result;
}

const sortOps = (ops: readonly string[]) => [...ops].sort();

describe('标准操作路由派生覆盖（mountCrud allowlist）', () => {
  const actual = scanExplicitBlocks();

  it('显式书写的标准操作块都已登记理由', () => {
    const unregistered: string[] = [];
    for (const [file, byContract] of actual) {
      const entries: readonly ExplicitCrudEntry[] = explicitCrudRoutes[file] ?? [];
      for (const [contract, ops] of byContract) {
        const registered = entries.find((e) => e.contract === contract);
        const missing = ops.filter((op) => !registered?.ops.includes(op as ExplicitCrudEntry['ops'][number]));
        if (missing.length) unregistered.push(`${file} :: ${contract}.${missing.join(' / ')}`);
      }
    }
    expect(
      unregistered,
      '以下标准操作仍显式书写且未登记：请改为 mountCrud 派生（服务函数按契约签名装配到 bag），确需显式时在 routes/_crud-explicit.ts 登记并写明理由',
    ).toEqual([]);
  });

  it('登记表只准缩小：已派生的块必须从 _crud-explicit.ts 删除', () => {
    const stale: string[] = [];
    for (const [file, entries] of Object.entries(explicitCrudRoutes)) {
      const byContract = actual.get(file);
      for (const entry of entries) {
        const ops = byContract?.get(entry.contract) ?? [];
        const gone = entry.ops.filter((op) => !ops.includes(op));
        if (gone.length) stale.push(`${file} :: ${entry.contract}.${gone.join(' / ')}`);
        if (!entry.reason.trim()) stale.push(`${file} :: ${entry.contract} 缺少 reason`);
      }
    }
    expect(stale, '以下登记项对应的显式块已不存在（或缺理由），请从 _crud-explicit.ts 删除').toEqual([]);
  });

  it('登记的操作与实际显式块一一对应（不多登）', () => {
    const over: string[] = [];
    for (const [file, entries] of Object.entries(explicitCrudRoutes)) {
      for (const entry of entries) {
        const ops = actual.get(file)?.get(entry.contract) ?? [];
        if (sortOps(entry.ops).join(',') !== sortOps([...new Set(ops)]).join(',')) over.push(`${file} :: ${entry.contract} 登记 [${sortOps(entry.ops)}] 实际 [${sortOps([...new Set(ops)])}]`);
      }
    }
    expect(over).toEqual([]);
  });
});
