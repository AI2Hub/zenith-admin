/**
 * 权限清单对账测试（seed ↔ 后端 guard 契约防漂移）
 *
 * 扫描 `src/routes/**` 中所有 `guard({ permission: ... })` 引用的权限码，
 * 断言每一个都能在 `@zenith/shared` 的 SEED_MENUS（菜单/按钮 permission 字段）中找到。
 *
 * 背景：权限码由菜单驱动分配——后端引用了 seed 中不存在的权限码时，
 * 除平台超管外**任何角色都无法获得该权限**（曾出现 system:user:assign 缺口导致
 * 用户授权功能对非超管完全不可用）。该测试在 CI 中拦截此类契约漂移。
 *
 * 新增权限码的正确姿势：先在 packages/shared/src/seed/menus/{段}.ts 对应菜单下补按钮
 * （permission 字段），再在路由 guard 中引用。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SEED_MENUS } from '@zenith/shared/seed';

const ROUTES_DIR = join(__dirname, '..', 'routes');

function collectRouteFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectRouteFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      result.push(full);
    }
  }
  return result;
}

/** 提取一个路由文件中 guard 引用的全部权限码（单个字符串 + 数组两种写法），不含 mountCrud 选项 */
function extractPermissions(content: string): string[] {
  const codes: string[] = [];
  const withoutMounts = stripMountCrudCalls(content);
  for (const m of withoutMounts.matchAll(/permission:\s*'([^']+)'/g)) {
    codes.push(m[1]);
  }
  for (const m of withoutMounts.matchAll(/permission:\s*\[([^\]]+)\]/g)) {
    for (const p of m[1].matchAll(/'([^']+)'/g)) {
      codes.push(p[1]);
    }
  }
  return codes.filter((c) => c !== '');
}

/** 找出每个 `mountCrud(` 调用的完整实参文本（括号配平） */
function mountCrudCalls(content: string): string[] {
  const calls: string[] = [];
  let index = content.indexOf('mountCrud(');
  while (index >= 0) {
    let depth = 0;
    let end = index + 'mountCrud'.length;
    for (; end < content.length; end++) {
      const ch = content[end];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
    }
    calls.push(content.slice(index + 'mountCrud('.length, end));
    index = content.indexOf('mountCrud(', end);
  }
  return calls;
}

function stripMountCrudCalls(content: string): string {
  return mountCrudCalls(content).reduce((acc, call) => acc.replace(call, ''), content);
}

/** 按深度 0 的逗号切分调用实参 */
function splitTopLevelArgs(argsText: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;
  for (const ch of argsText) {
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/** 取对象字面量文本里某个键的值文本（括号配平） */
function propertyText(objectText: string, key: string): string | null {
  const m = new RegExp(`\\b${key}:\\s*`).exec(objectText);
  if (!m) return null;
  const start = m.index + m[0].length;
  const open = objectText[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return objectText.slice(start).match(/^[^,}\n]+/)?.[0]?.trim() ?? null;
  let depth = 0;
  for (let i = start; i < objectText.length; i++) {
    if (objectText[i] === open) depth++;
    else if (objectText[i] === close) { depth--; if (depth === 0) return objectText.slice(start, i + 1); }
  }
  return null;
}

const CRUD_SUFFIX: Record<string, string> = { list: 'list', detail: 'list', create: 'create', update: 'update', remove: 'delete', removeBatch: 'delete' };

/**
 * `mountCrud` 派生路由引用的权限码：前缀写法按服务能力展开后缀（与 routes/_crud.ts 的 PERMISSION_SUFFIX 一致），
 * 映射写法直接取 `permission: { ... }` 里的字面量。服务传整个 `xxxService` 时视为六个标准操作都存在。
 */
function extractMountCrudPermissions(content: string): string[] {
  const codes: string[] = [];
  for (const call of mountCrudCalls(content)) {
    const [, , bag = '', options = ''] = splitTopLevelArgs(call);
    const permission = propertyText(options, 'permission');
    if (!permission || permission === 'null') continue;
    const excluded = new Set([...(propertyText(options, 'exclude') ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
    const prefix = permission.match(/^'([^']+)'$/);
    if (prefix) {
      const has = (fn: string) => !bag.startsWith('{') || new RegExp(`\\b${fn}:`).test(bag);
      const ops = (['list', 'detail', 'create', 'update', 'remove', 'removeBatch'] as const).filter((op) => !excluded.has(op)).filter((op) => (
        op === 'list' ? has('list') : op === 'detail' ? has('get') : op === 'removeBatch' ? has('removeMany') : has(op)
      ));
      for (const op of ops) codes.push(`${prefix[1]}:${CRUD_SUFFIX[op]}`);
      continue;
    }
    for (const m of permission.matchAll(/'([^']+)'/g)) codes.push(m[1]);
  }
  return codes;
}

describe('权限清单对账（routes guard ↔ SEED_MENUS）', () => {
  it('后端 guard 引用的每个权限码都必须在 seed 菜单中声明', () => {
    const seedPermissions = new Set(
      SEED_MENUS.map((m) => m.permission).filter((p): p is string => !!p),
    );
    expect(seedPermissions.size).toBeGreaterThan(0);

    const missingByFile = new Map<string, string[]>();
    let mountCrudCodes = 0;
    for (const file of collectRouteFiles(ROUTES_DIR)) {
      const content = readFileSync(file, 'utf-8');
      const derived = extractMountCrudPermissions(content);
      mountCrudCodes += derived.length;
      const missing = [...new Set([...extractPermissions(content), ...derived])].filter((c) => !seedPermissions.has(c));
      if (missing.length > 0) {
        missingByFile.set(file.replace(ROUTES_DIR, 'routes'), missing);
      }
    }
    // mountCrud 派生的权限码也在对账范围内（前缀 + 后缀展开）
    expect(mountCrudCodes).toBeGreaterThan(100);

    const report = [...missingByFile.entries()]
      .map(([file, codes]) => `  ${file}: ${codes.join(', ')}`)
      .join('\n');
    expect(
      missingByFile.size,
      `以下路由引用的权限码未在 packages/shared/src/seed/menus/{段}.ts 的 SEED_MENUS 中声明，`
      + `除平台超管外任何角色都无法获得这些权限（请先补 seed 按钮再引用）：\n${report}`,
    ).toBe(0);
  });

  it('告警菜单使用独立顶级目录且不保留旧系统运维节点', () => {
    expect(SEED_MENUS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 15000, parentId: 0, title: '告警中心', type: 'directory', sort: 4 }),
      expect.objectContaining({ id: 15010, parentId: 15000, path: '/alerts/rules', component: 'alerts/rules/AlertRulesPage' }),
      expect.objectContaining({ id: 15020, parentId: 15000, path: '/alerts/events', component: 'alerts/events/AlertEventsPage' }),
    ]));
    expect(SEED_MENUS.some((menu) => [2550, 2551, 2552, 2553, 2554, 2560, 2561].includes(menu.id))).toBe(false);
    expect(SEED_MENUS.some((menu) => menu.permission?.startsWith('system:monitor:alert'))).toBe(false);
  });

  it('数据库备份并入数据库管理页，不保留独立菜单与 system:db-backup:* 权限码', () => {
    expect(SEED_MENUS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 2370, path: '/system/db-admin', component: 'system/db-admin/DbAdminPage' }),
    ]));
    expect(SEED_MENUS.some((menu) => menu.id >= 2110 && menu.id <= 2113)).toBe(false);
    expect(SEED_MENUS.some((menu) => menu.path === '/system/db-backups')).toBe(false);
    expect(SEED_MENUS.some((menu) => menu.permission?.startsWith('system:db-backup:'))).toBe(false);
  });
});
