import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JwtPayload } from '../../middleware/auth';
import type { DbTransaction } from '../../db/types';

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
import { createNumberingRule, getNumberingRule, publishNumberingRule, updateNumberingRule, upsertNumberingBinding, removeNumberingBinding } from './numbering.service';
import type { NumberingRuleRow } from '../../db/schema/numbering';

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

  it('租户不能创建支付规则或重绑全局支付场景', async () => {
    interceptQueries([]);
    await expect(createNumberingRule({ code: 'pay.evil', name: '支付', scene: 'payment.order', status: 'enabled', draft: { ...draft, scope: 'global' } })).rejects.toMatchObject({ status: 403 });
    await expect(upsertNumberingBinding({ scene: 'payment.order', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} })).rejects.toMatchObject({ status: 403 });
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

  it('绑定拒绝错误业务、其他租户的规则和不属于规则的版本', async () => {
    const input = { scene: 'workflow.instance' as const, ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} };
    interceptQueries([[{ ...rule, scene: 'biz.leave' }], [{ ...rule, tenantId: 8 }], [rule], []]);
    await expect(upsertNumberingBinding(input)).rejects.toMatchObject({ status: 400 });
    await expect(upsertNumberingBinding(input)).rejects.toMatchObject({ status: 400 });
    await expect(upsertNumberingBinding(input)).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('绑定禁止通过表单覆写租户与组织身份', async () => {
    interceptQueries([]);
    await expect(upsertNumberingBinding({ scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: { tenantId: 'formData.tenant' } })).rejects.toMatchObject({ status: 400 });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('平台普通账号不能重绑平台内置缺省规则', async () => {
    state.user = { ...state.user, tenantId: null };
    interceptQueries([[{ ...rule, tenantId: null, isBuiltin: true }]]);
    await expect(upsertNumberingBinding({ scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} })).rejects.toMatchObject({ status: 403 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('平台普通账号使用自建规则也不能覆盖平台默认绑定', async () => {
    state.user = { ...state.user, tenantId: null };
    interceptQueries([[{ ...rule, tenantId: null, isBuiltin: false }]]);
    await expect(upsertNumberingBinding({ scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} })).rejects.toMatchObject({ status: 403 });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('改绑在稳定键锁成功之前不读取或锁定规则', async () => {
    let unlock!: () => void;
    vi.mocked(db.execute).mockImplementationOnce(() => new Promise(resolve => { unlock = () => resolve([]); }));
    interceptQueries([[{ ...rule, scene: 'biz.leave' }]]);
    const pending = upsertNumberingBinding({ scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} });
    const rejected = expect(pending).rejects.toMatchObject({ status: 400 });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.select).not.toHaveBeenCalled();
    unlock();
    await rejected;
    expect(db.select).toHaveBeenCalledOnce();
  });

  it('删除在取得锁后重新读取，不能依据旧目标删除新的内置绑定', async () => {
    state.user = { ...state.user, tenantId: null };
    const before = { id: 8, tenantId: null, scene: 'workflow.instance', ownerKey: '89', ruleId: 4, versionId: 9 };
    const after = { ...before, ruleId: 12, versionId: 13 };
    const statements = interceptQueries([[before], [after], [{ ...rule, id: 12, tenantId: null, isBuiltin: true }]]);
    vi.spyOn(db, 'delete');
    await expect(removeNumberingBinding(8)).rejects.toMatchObject({ status: 403 });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(statements[2]!.params).toContain(12);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('平台管理员也不能删除平台默认绑定导致业务失去缺省规则', async () => {
    state.user = { userId: 1, username: 'admin', roles: ['super_admin'], tenantId: null };
    const binding = { id: 8, tenantId: null, scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9 };
    interceptQueries([[binding], [binding]]);
    vi.spyOn(db, 'delete');
    await expect(removeNumberingBinding(8)).rejects.toMatchObject({ status: 409 });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('具体流程绑定校验所属租户', async () => {
    const input = { scene: 'workflow.instance' as const, ownerKey: '89', ruleId: 4, versionId: 9, parameterMapping: {} };
    const statements = interceptQueries([[rule], [{ id: 9, ruleId: 4, config: draft }], []]);
    await expect(upsertNumberingBinding(input)).rejects.toMatchObject({ status: 404 });
    expect(statements[2]!.sql).toContain('"workflow_definitions"."tenant_id"');
    expect(statements[2]!.params).toContain(7);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('工作流模板所需自定义参数不得漏映射', async () => {
    interceptQueries([[rule], [{ id: 9, ruleId: 4, config: { ...draft, template: '{categoryCode}{YYYYMMDD}{SEQ:4}' } }]]);
    await expect(upsertNumberingBinding({ scene: 'workflow.instance', ownerKey: '*', ruleId: 4, versionId: 9, parameterMapping: {} })).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
