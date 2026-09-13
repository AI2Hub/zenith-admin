import { describe, expect, it } from 'vitest';
import { findingKey, scanTenantIsolation } from './_tenant-isolation-scan';
import { tenantIsolationBaseline } from './_tenant-isolation-baseline';

/**
 * 租户隔离守卫：带 tenantId 列的表按请求侧 id 访问时必须叠加租户条件（或经 ensure* 校验 / defineCrudService 产物）。
 * 现状登记在 `_tenant-isolation-baseline.ts`，只准缩小。
 */
describe('租户隔离静态扫描', () => {
  const findings = scanTenantIsolation();
  const found = new Map<string, number[]>();
  for (const f of findings) found.set(findingKey(f), [...(found.get(findingKey(f)) ?? []), f.line]);
  const baseline = new Map(tenantIsolationBaseline.map((e) => [findingKey(e), e]));

  it('按请求 id 访问带租户列的表都叠加了租户条件（未登记的新访问点即失败）', () => {
    const unregistered = [...found.entries()]
      .filter(([key]) => !baseline.has(key))
      .map(([key, lines]) => `${key} @${lines.join(',')}`);
    expect(
      unregistered,
      '以下函数按请求侧 id 访问带 tenantId 列的表却没有租户条件：请叠加 tenantScope(T) / 用 defineCrudService 的 whereId / 经 ensureXxx(id) 校验；'
        + '确属平台级或系统上下文的，在 services/_tenant-isolation-baseline.ts 登记并写明理由',
    ).toEqual([]);
  });

  it('基线只准缩小：已修复的访问点必须从基线删除', () => {
    const stale = tenantIsolationBaseline.filter((e) => !found.has(findingKey(e))).map(findingKey);
    expect(stale, '以下基线条目对应的访问点已不存在，请从 _tenant-isolation-baseline.ts 删除').toEqual([]);
  });

  it('基线条目都写了理由且不重复', () => {
    const keys = tenantIsolationBaseline.map(findingKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(tenantIsolationBaseline.filter((e) => !e.reason.trim()).map(findingKey)).toEqual([]);
  });
});
