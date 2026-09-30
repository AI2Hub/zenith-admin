import { describe, expect, it, vi } from 'vitest';
import type { CmsFieldDefinition, CmsNestedFieldDefinition } from '@zenith/shared/cms';
import type { DbExecutor } from '../../db/types';
import { compileCmsFieldDefinitions } from './cms-model-compiler';

function executorReturning(results: unknown[][]) {
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: async () => rows, orderBy: async () => rows };
    return chain;
  });
  return { executor: { select } as unknown as DbExecutor, select };
}
function componentVersion(fields: CmsNestedFieldDefinition[], overrides: { ownerSiteId?: number | null; status?: string; id?: number; dependencies?: number[] } = {}) {
  return { component: { id: overrides.id ?? 10, name: '共享卡片', ownerSiteId: overrides.ownerSiteId ?? null, status: overrides.status ?? 'enabled' },
    version: { fields, componentVersionIds: overrides.dependencies ?? [] } };
}
const binding: CmsFieldDefinition = { name: 'card', label: '卡片', fieldType: 'object', configuration: { componentVersionId: 101 } };

describe('CMS immutable component compiler', () => {
  it('uses authoritative frozen fields and options without consulting nested mutable components or dictionaries', async () => {
    const frozen: CmsNestedFieldDefinition[] = [{ id: 'nested', name: 'nested', label: '嵌套', fieldType: 'object', configuration: { componentVersionId: 99, fields: [
      { id: 'platform', name: 'platform', label: '平台', fieldType: 'select', optionSource: 'dict', dictCode: 'platform', resolvedOptions: [{ label: '原选项', value: 'old' }] },
    ] } }];
    const { executor, select } = executorReturning([[componentVersion(frozen, { dependencies: [99] })]]);
    const input: CmsFieldDefinition[] = [{ ...binding, configuration: { ...binding.configuration, fields: [{ name: 'injected', label: '伪造', fieldType: 'text' }] } }];
    const compiled = await compileCmsFieldDefinitions(executor, input, { ownerSiteId: 2 });
    expect(compiled.fields[0].configuration?.fields?.[0]).toMatchObject(frozen[0]);
    expect(compiled.componentVersionIds).toEqual([99, 101]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(input[0].configuration?.fields?.[0].name).toBe('injected');
  });

  it.each([null, 2])('rejects a component owned by a different site (model owner %s)', async ownerSiteId => {
    const { executor } = executorReturning([[componentVersion([{ name: 'title', label: '标题', fieldType: 'text' }], { ownerSiteId: 3 })]]);
    await expect(compileCmsFieldDefinitions(executor, [binding], { ownerSiteId })).rejects.toThrow('不能引用其他站点专属组件');
  });

  it('rejects missing versions, disabled direct references and self references', async () => {
    await expect(compileCmsFieldDefinitions(executorReturning([[]]).executor, [binding], { ownerSiteId: null })).rejects.toThrow('版本不存在');
    await expect(compileCmsFieldDefinitions(executorReturning([[componentVersion([], { status: 'disabled' })]]).executor, [binding], { ownerSiteId: null })).rejects.toThrow('已停用');
    await expect(compileCmsFieldDefinitions(executorReturning([[componentVersion([])]]).executor, [binding], { ownerSiteId: null, componentId: 10 })).rejects.toThrow('循环引用');
  });

  it('resolves dictionary-backed fields at every inline depth and rejects invalid nested defaults', async () => {
    const input: CmsFieldDefinition[] = [{ name: 'group', label: '分组', fieldType: 'object', configuration: { fields: [{ name: 'status', label: '状态', fieldType: 'select', optionSource: 'dict', dictCode: 'states', defaultValue: 'removed' }] } }];
    await expect(compileCmsFieldDefinitions(executorReturning([[{ label: '有效', value: 'valid' }]]).executor, input, { ownerSiteId: null })).rejects.toThrow('默认值无效');
  });

  it('enforces the total field budget after shared components expand', async () => {
    const fields: CmsNestedFieldDefinition[] = Array.from({ length: 250 }, (_, i) => ({ id: `field-${i}`, name: `field_${i}`, label: `字段 ${i}`, fieldType: 'text' }));
    const { executor } = executorReturning([[componentVersion(fields)], [componentVersion(fields)]]);
    await expect(compileCmsFieldDefinitions(executor, [binding, { ...binding, name: 'second' }], { ownerSiteId: null })).rejects.toThrow('字段总数');
  });
});
