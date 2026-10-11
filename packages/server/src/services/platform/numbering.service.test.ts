import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JwtPayload } from '../../middleware/auth';
import type { DbTransaction } from '../../db/types';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({
  user: { userId: 9, username: 'operator', roles: ['operator'], tenantId: 7 } as JwtPayload,
}));
vi.mock('../../config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, config: { ...actual.config, multiTenantMode: true } };
});
vi.mock('../../db', async () => ({ db: (await import('drizzle-orm/postgres-js')).drizzle.mock({ casing: 'snake_case' }) }));
vi.mock('../../lib/context', () => ({ currentUser: () => state.user, currentUserId: () => state.user.userId }));

import { db } from '../../db';
import { createNumberingRule, getNumberingRule, listAvailableNumberingRules, publishNumberingRule, updateNumberingRule, listNumberingDefaults, listNumberingRuleUsages, updateNumberingDefault, resetNumberingDefault } from './numbering.service';
import type { NumberingRuleRow } from '../../db/schema/numbering';
import { numberingBindings, workflowDefinitions, workflowInstances } from '../../db/schema';

const draft = {
  template: 'WF{YYYYMMDD}{SEQ:4}', start: '1', step: '1', width: 4,
  resetPeriod: 'daily' as const, timezone: 'Asia/Shanghai', scope: 'owner' as const,
};
const rule: NumberingRuleRow = {
  id: 4, code: 'workflow.test', name: '测试', scene: 'workflow.instance', tenantId: 7, isBuiltin: false,
  status: 'enabled', description: null, draft, revision: 3, currentVersion: 1,
  createdBy: 1, updatedBy: 1, createdAt: new Date('2026-10-11T00:00:00Z'), updatedAt: new Date('2026-10-11T00:00:00Z'),
};
type Statement = { sql: string; params: unknown[] };
type Executable = { execute: () => Promise<unknown[]>; toSQL: () => Statement };

function interceptQueries(results: unknown[][]) {
  const statements: Statement[] = [];
  const intercept = (query: Executable) => {
    query.execute = async () => { statements.push(query.toSQL()); return results.shift() ?? []; };
    return query;
  };
  const select = db.select.bind(db);
  vi.spyOn(db, 'select').mockImplementation((...args: unknown[]) => {
    const builder = Reflect.apply(select, db, args);
    const from = builder.from;
    builder.from = (...fromArgs: unknown[]) => intercept(Reflect.apply(from, builder, fromArgs));
    return builder;
  });
  const update = db.update.bind(db);
  vi.spyOn(db, 'update').mockImplementation((...args: unknown[]) => {
    const builder = Reflect.apply(update, db, args);
    const set = builder.set;
    builder.set = (...setArgs: unknown[]) => intercept(Reflect.apply(set, builder, setArgs));
    return builder;
  });
  vi.spyOn(db, 'insert');
  return statements;
}

beforeEach(() => {
  vi.restoreAllMocks();
  state.user = { userId: 9, username: 'operator', roles: ['operator'], tenantId: 7 };
  vi.spyOn(db, 'transaction').mockImplementation(async run => run(db as unknown as DbTransaction));
  vi.spyOn(db, 'execute').mockResolvedValue([]);
});

describe('编号规则管理权限与并发', () => {
  it('详情 SQL 只允许当前租户及继承平台模板', async () => {
    const statements = interceptQueries([]);
    await expect(getNumberingRule(99)).rejects.toMatchObject({ status: 404 });
    expect(statements[0]!.sql).toContain('"numbering_rules"."tenant_id" is null');
    const match = /"numbering_rules"\."tenant_id" = \$(\d+)/.exec(statements[0]!.sql);
    expect(match).not.toBeNull();
    expect(statements[0]!.params[Number(match![1]) - 1]).toBe(7);
  });

  it('租户可读取平台模板但不能修改或发布它', async () => {
    const platform = { ...rule, tenantId: null, isBuiltin: true };
    interceptQueries([[platform], [platform], [platform]]);
    expect((await getNumberingRule(4)).isBuiltin).toBe(true);
    await expect(updateNumberingRule(4, { name: '恶意修改', expectedRevision: 3 })).rejects.toMatchObject({ status: 403 });
    await expect(publishNumberingRule(4, { expectedRevision: 3 })).rejects.toMatchObject({ status: 403 });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('租户不能创建支付规则或配置平台支付默认', async () => {
    interceptQueries([]);
    await expect(createNumberingRule({ code: 'pay.evil', name: '支付', scene: 'payment.order', status: 'enabled', draft: { ...draft, scope: 'global' } })).rejects.toMatchObject({ status: 403 });
    await expect(updateNumberingDefault('payment.order', { ruleId: 4, versionId: 9, expectedVersionId: null })).rejects.toMatchObject({ status: 403 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('更新与发布都拒绝过期 revision，且先获取行锁', async () => {
    const statements = interceptQueries([[rule], [rule]]);
    await expect(updateNumberingRule(4, { name: '修改', expectedRevision: 2 })).rejects.toMatchObject({ status: 409 });
    await expect(publishNumberingRule(4, { expectedRevision: 2 })).rejects.toMatchObject({ status: 409 });
    expect(statements.every(statement => statement.sql.includes('for update'))).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('自己租户的合法编辑只增加 revision，不修改已发布版本', async () => {
    const statements = interceptQueries([[rule], [{ ...rule, name: '新名称', revision: 4 }]]);
    const changed = await updateNumberingRule(4, { name: '新名称', expectedRevision: 3 });
    expect(changed.name).toBe('新名称');
    expect(changed.revision).toBe(4);
    expect(statements[1]!.sql).toContain('update "numbering_rules"');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('已发布规则不能用新草稿重置流水策略', async () => {
    interceptQueries([[rule], [{ ruleId: 4, version: 1, config: draft }]]);
    await expect(updateNumberingRule(4, { draft: { ...draft, start: '9' }, expectedRevision: 3 })).rejects.toMatchObject({ status: 409 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    { label: '已发布或禁用流程', counts: [0, 0, 1, 0] },
    { label: '未发号草稿快照', counts: [0, 0, 0, 1] },
  ])('删除或改绑后仍不能停用被 $label 引用的规则', async ({ counts }) => {
    const statements = interceptQueries([[rule]]);
    const count = vi.spyOn(db, '$count');
    for (const value of counts) count.mockResolvedValueOnce(value);
    await expect(updateNumberingRule(4, { status: 'disabled', expectedRevision: 3 })).rejects.toMatchObject({ status: 409 });
    expect(statements[0]!.sql).toContain('for update');
    expect(db.update).not.toHaveBeenCalled();
    const definitionCall = count.mock.calls.find(([table]) => table === workflowDefinitions)!;
    const instanceCall = count.mock.calls.find(([table]) => table === workflowInstances)!;
    const dialect = new PgDialect({ casing: 'snake_case' });
    const bindingsCall = count.mock.calls.find(([table]) => table === numberingBindings)!;
    expect(dialect.sqlToQuery(bindingsCall[1]!).params).toEqual([4, '*']);
    const definition = dialect.sqlToQuery(definitionCall[1]!);
    const instance = dialect.sqlToQuery(instanceCall[1]!);
    expect(definition.sql).toContain("#>> '{settings,numbering,ruleId}'");
    expect(definition.params).toEqual(['published', 'disabled', '4']);
    expect(instance.sql).toContain('"workflow_instances"."serial_no" is null');
    expect(instance.sql).toContain("#>> '{flowData,settings,numbering,ruleId}'");
    expect(instance.params).toEqual(['draft', 'returned', '4']);
  });
  it('允许停用未绑定、未发号且无流程/草稿固定引用的规则', async () => {
    interceptQueries([[rule], [{ ...rule, status: 'disabled', revision: 4 }]]);
    vi.spyOn(db, '$count').mockResolvedValue(0);
    expect((await updateNumberingRule(4, { status: 'disabled', expectedRevision: 3 })).status).toBe('disabled');
    expect(db.update).toHaveBeenCalledOnce();
  });
  it('规则选项统一提取多FORM参数并排除旧系统变量别名', async () => {
    interceptQueries([[{ id: rule.id, code: rule.code, name: rule.name, scene: rule.scene, currentVersion: 1, versionId: 9,
      config: { ...draft, template: '{USER}-{FORM.地区}-{SEQ:2}-{FORM.category}-{DEPT_CODE}' } }]]);
    const [option] = await listAvailableNumberingRules({ scene: 'workflow.instance' });
    expect(option?.requiredParameters).toEqual(['FORM.地区', 'FORM.category']);
  });
  it('返回14个业务有效默认并采用租户覆盖，支付始终只用平台默认', async () => {
    const platform = { scene: 'workflow.instance', tenantId: null, ruleId: 1, ruleName: '平台默认', versionId: 11, version: 1, config: draft, sourceTenantName: null };
    const local = { ...platform, tenantId: 7, ruleId: 4, ruleName: '租户默认', versionId: 9, version: 3, sourceTenantName: '租户七' };
    const payment = { ...platform, scene: 'payment.order', ruleId: 5, versionId: 15, config: { ...draft, scope: 'global' } };
    const statements = interceptQueries([[platform, local, payment, { ...payment, tenantId: 7, ruleId: 99, versionId: 99 }]]);
    const defaults = await listNumberingDefaults();
    expect(defaults).toHaveLength(14);
    expect(defaults.find(row => row.scene === 'workflow.instance')).toMatchObject({ ruleId: 4, versionId: 9, version: 3, tenantId: 7,
      inherited: false, sourceTenantName: '租户七', expectedVersionId: 9, canUpdate: true, canReset: true, scope: 'owner' });
    expect(defaults.find(row => row.scene === 'payment.order')).toMatchObject({ ruleId: 5, versionId: 15, expectedVersionId: null,
      inherited: true, canUpdate: false, canReset: false, scope: 'global' });
    expect(statements[0]!.sql).toContain('"owner_key" =');
    expect(statements[0]!.params).toContain('*'); expect(statements[0]!.params).toContain(7);
  });
  it('没有租户覆盖时展示继承平台，新增覆盖的expectedVersionId为null', async () => {
    interceptQueries([[{ scene: 'workflow.instance', tenantId: null, ruleId: 1, ruleName: '平台', versionId: 11, version: 2, config: draft, sourceTenantName: null }]]);
    const defaults = await listNumberingDefaults();
    expect(defaults[0]).toMatchObject({ ruleId: 1, inherited: true, expectedVersionId: null, sourceTenantName: '平台', canReset: false });
  });
  it('默认配置先锁稳定键，再检查自己的版本；过期操作不锁规则也不写入', async () => {
    let unlock!: () => void;
    vi.mocked(db.execute).mockImplementationOnce(() => new Promise(resolve => { unlock = () => resolve([]); }));
    const statements = interceptQueries([[{ id: 8, ruleId: 4, versionId: 10 }]]);
    const pending = updateNumberingDefault('workflow.instance', { ruleId: 4, versionId: 9, expectedVersionId: null });
    const rejected = expect(pending).rejects.toMatchObject({ status: 409 });
    expect(db.select).not.toHaveBeenCalled(); unlock(); await rejected;
    expect(statements).toHaveLength(1); expect(db.insert).not.toHaveBeenCalled();
    expect(statements[0]!.params.slice(0, 3)).toEqual(['workflow.instance', '*', 7]);
  });
  it('租户覆盖只写owner=*，不接受编号字段映射，返回所选实际版本', async () => {
    const row = { scene: 'workflow.instance', tenantId: 7, ruleId: 4, ruleName: rule.name, versionId: 9, version: 2, config: draft, sourceTenantName: '租户七' };
    const statements = interceptQueries([[], [rule], [{ id: 9 }], [row]]);
    const chain = { values: vi.fn(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }; chain.values.mockReturnValue(chain);
    vi.mocked(db.insert).mockReturnValue(chain as never);
    const result = await updateNumberingDefault('workflow.instance', { ruleId: 4, versionId: 9, expectedVersionId: null });
    expect(result).toMatchObject({ ruleId: 4, versionId: 9, version: 2, expectedVersionId: 9 });
    expect(chain.values).toHaveBeenCalledWith({ scene: 'workflow.instance', ownerKey: '*', tenantId: 7, ruleId: 4, versionId: 9, parameterMapping: {} });
    expect(statements[1]!.sql).toContain('for update');
  });
  it.each([
    { rule: { ...rule, scene: 'biz.leave' }, version: undefined },
    { rule: { ...rule, tenantId: 8 }, version: undefined },
    { rule, version: [] },
  ])('默认选择拒绝其他业务、其他租户和不匹配的版本', async input => {
    interceptQueries([[], [input.rule], ...(input.version ? [input.version] : [])]);
    await expect(updateNumberingDefault('workflow.instance', { ruleId: 4, versionId: 9, expectedVersionId: null })).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('平台普通用户不能覆盖平台默认，平台管理员在租户视角不能改支付默认', async () => {
    interceptQueries([]);
    state.user = { ...state.user, tenantId: null };
    await expect(updateNumberingDefault('workflow.instance', { ruleId: 4, versionId: 9, expectedVersionId: null })).rejects.toMatchObject({ status: 403 });
    state.user = { userId: 1, username: 'admin', roles: ['super_admin'], tenantId: null, viewingTenantId: 7 };
    await expect(updateNumberingDefault('payment.order', { ruleId: 4, versionId: 9, expectedVersionId: null })).rejects.toMatchObject({ status: 403 });
    expect(db.select).not.toHaveBeenCalled();
  });
  it('恢复默认只删除当前租户覆盖并展示平台继承，保留具体流程owner和冻结版本', async () => {
    const platform = { scene: 'workflow.instance', tenantId: null, ruleId: 1, ruleName: '平台默认', versionId: 11, version: 1, config: draft, sourceTenantName: null };
    const statements = interceptQueries([[{ id: 8, ruleId: 4, versionId: 9 }], [{ id: 1 }], [rule], [platform]]);
    const deleteChain = { where: vi.fn().mockResolvedValue(undefined) }; vi.spyOn(db, 'delete').mockReturnValue(deleteChain as never);
    const reset = await resetNumberingDefault('workflow.instance', { expectedVersionId: 9 });
    expect(reset).toMatchObject({ ruleId: 1, versionId: 11, inherited: true, expectedVersionId: null });
    expect(db.delete).toHaveBeenCalledOnce(); expect(db.update).not.toHaveBeenCalled();
    const deletion = new PgDialect({ casing: 'snake_case' }).sqlToQuery(deleteChain.where.mock.calls[0]![0]);
    expect(deletion.params).toEqual([8, 7]); expect(statements[2]!.sql).toContain('for update');
  });
  it('不能删除平台默认或没有平台默认时删除租户覆盖', async () => {
    interceptQueries([[{ id: 8, ruleId: 4, versionId: 9 }], []]);
    vi.spyOn(db, 'delete');
    await expect(resetNumberingDefault('workflow.instance', { expectedVersionId: 9 })).rejects.toMatchObject({ status: 409 });
    state.user = { userId: 1, username: 'admin', roles: ['super_admin'], tenantId: null };
    await expect(resetNumberingDefault('workflow.instance', { expectedVersionId: 11 })).rejects.toMatchObject({ status: 409 });
    expect(db.delete).not.toHaveBeenCalled();
  });
  it('实际引用使用冻结JSON versionId关联真实版本，租户只能看到自己流程和可继承的平台默认', async () => {
    const statements = interceptQueries([[rule], [{ scene: 'workflow.instance', tenantId: null, tenantName: null, versionId: 11, version: 1 }],
      [{ id: 22, name: '费用报销', tenantId: 7, tenantName: '租户七', versionId: 9, version: 2 }]]);
    const usages = await listNumberingRuleUsages(4);
    expect(usages).toEqual([
      { kind: 'default', scene: 'workflow.instance', businessName: '流程实例', name: '平台默认规则', tenantId: null, tenantName: '平台', versionId: 11, version: 1, objectKey: null, destination: null },
      { kind: 'workflow', scene: 'workflow.instance', businessName: '流程实例', name: '费用报销', tenantId: 7, tenantName: '租户七', versionId: 9, version: 2, objectKey: '22', destination: '/workflow/designer/22' },
    ]);
    expect(statements[1]!.params).toContain('*');
    const workflow = statements[2]!;
    expect(workflow.sql).toContain("#>> '{settings,numbering,versionId}'");
    expect(workflow.sql).toContain('"numbering_versions"."id"::text');
    expect(workflow.params).toContain(7); expect(workflow.params).toContain('published'); expect(workflow.params).toContain('disabled');
    expect(workflow.sql.split(' from ')[0]).not.toContain('"workflow_definitions"."flow_data"');
  });
});
