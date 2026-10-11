import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type { NumberingConfig } from '@zenith/shared/platform';
import { createPgClient } from '../../db/client';
import { closeDb } from '../../db';
import * as schema from '../../db/schema';
import { runWithCurrentUser } from '../../lib/context';
import { allocateBusinessNumber, attachBusinessNumber } from './numbering-runtime';
import { listNumberingDefaults, listNumberingRuleUsages, resetNumberingDefault, updateNumberingDefault } from './numbering.service';

// Opt-in only: this suite requires a disposable database created by the QA runner.
const databaseUrl = process.env.NUMBERING_TEST_DATABASE_URL;
const isolated = databaseUrl && /^\/zenith_numbering_qa_\d+$/.test(new URL(databaseUrl).pathname);
const integration = isolated ? describe : describe.skip;

integration('business numbering on PostgreSQL', () => {
  const client = createPgClient(databaseUrl ?? 'postgres://localhost/unused', { max: 12 });
  const database = drizzle(client, { schema, casing: 'snake_case' });
  let tenantA: number;
  let tenantB: number;
  let actorId: number;
  let ordinal = 0;
  const at = new Date('2026-10-11T04:00:00Z');
  const config: NumberingConfig = {
    template: 'QA{YYYYMMDD}{SEQ:6}', start: '1', step: '1', width: 6,
    resetPeriod: 'daily', timezone: 'Asia/Shanghai', scope: 'owner',
  };

  beforeAll(async () => {
    const [{ name }] = await client<{ name: string }[]>`select current_database() as name`;
    expect(name).toMatch(/^zenith_numbering_qa_\d+$/);
    const tenants = await database.insert(schema.tenants).values([
      { code: `numbering_qa_a_${Date.now()}`, name: '编号隔离测试 A' },
      { code: `numbering_qa_b_${Date.now()}`, name: '编号隔离测试 B' },
    ]).returning({ id: schema.tenants.id });
    [tenantA, tenantB] = tenants.map(row => row.id);
    const [actor] = await database.insert(schema.users).values({ username: `qa_numbering_${Date.now()}`, nickname: '编号测试用户', password: 'unused-test-fixture', tenantId: tenantA }).returning();
    actorId = actor.id;
  });
  afterAll(async () => { await client.end(); await closeDb(); });

  async function fixture(options: { scene?: string; tenantId?: number | null; config?: Partial<NumberingConfig> } = {}) {
    const scene = options.scene ?? 'workflow.instance';
    const [rule] = await database.insert(schema.numberingRules).values({
      code: `qa.${++ordinal}`, name: 'QA rule', scene, tenantId: options.tenantId ?? null,
      draft: { ...config, ...options.config }, currentVersion: 1,
    }).returning();
    const [version] = await database.insert(schema.numberingVersions).values({ ruleId: rule.id, version: 1, config: rule.draft }).returning();
    return { rule, version };
  }

  it('serializes concurrent first allocations without duplicates or lost increments', async () => {
    const { rule, version } = await fixture();
    const values = await Promise.all(Array.from({ length: 24 }, (_, index) => database.transaction(tx => allocateBusinessNumber(tx, {
      scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'concurrent', ruleVersionId: version.id, allocationKey: String(index), at,
    }))));
    expect(new Set(values).size).toBe(24);
    expect(values.sort()[0]).toBe('QA20261011000001');
    expect(values.sort().at(-1)).toBe('QA20261011000024');
    const [counter] = await database.select().from(schema.numberingCounters).where(eq(schema.numberingCounters.ruleId, rule.id));
    expect(counter.value).toBe(24n);
  });

  it('deduplicates simultaneous retries and rejects a changed request context', async () => {
    const { rule, version } = await fixture();
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'retry', ruleVersionId: version.id, allocationKey: 'operation', at };
    const values = await Promise.all(Array.from({ length: 12 }, () => database.transaction(tx => allocateBusinessNumber(tx, request))));
    expect(new Set(values).size).toBe(1);
    expect(await database.$count(schema.numberingAllocations, eq(schema.numberingAllocations.ruleId, rule.id))).toBe(1);
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, context: { categoryCode: 'changed' } }))).rejects.toThrow('业务参数发生变化');
  });

  it('rolls back counters and receipts with the business transaction', async () => {
    const { rule, version } = await fixture();
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'rollback', ruleVersionId: version.id, allocationKey: 'first', at };
    await expect(database.transaction(async tx => { await allocateBusinessNumber(tx, request); throw new Error('business rejected'); })).rejects.toThrow('business rejected');
    expect(await database.$count(schema.numberingCounters, eq(schema.numberingCounters.ruleId, rule.id))).toBe(0);
    expect(await database.$count(schema.numberingAllocations, eq(schema.numberingAllocations.ruleId, rule.id))).toBe(0);
    expect(await database.transaction(tx => allocateBusinessNumber(tx, request))).toBe('QA20261011000001');
  });

  it('isolates tenant and owner sequences and attaches the correct business row', async () => {
    const { version } = await fixture();
    const base = { scene: 'workflow.instance', ruleVersionId: version.id, allocationKey: 'same', at };
    for (const [tenantId, ownerKey, businessKey] of [[tenantA, 'owner-a', '11'], [tenantA, 'owner-b', '12'], [tenantB, 'owner-a', '13']] as const) {
      await database.transaction(async tx => {
        const number = await allocateBusinessNumber(tx, { ...base, tenantId, ownerKey });
        expect(number).toBe('QA20261011000001');
        await attachBusinessNumber(tx, { scene: base.scene, tenantId, ownerKey, number, businessKey });
      });
    }
    const rows = await database.select().from(schema.numberingAllocations).where(eq(schema.numberingAllocations.versionId, version.id));
    expect(rows.map(row => row.businessKey).sort()).toEqual(['11', '12', '13']);
  });

  it('keeps the sequence across immutable versions and replay ignores newer bindings', async () => {
    const { rule, version } = await fixture();
    const [next] = await database.insert(schema.numberingVersions).values({ ruleId: rule.id, version: 2, config: { ...rule.draft, template: 'NEW{YYYYMMDD}{SEQ:6}' } }).returning();
    const base = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'versions', at };
    const first = await database.transaction(tx => allocateBusinessNumber(tx, { ...base, allocationKey: 'one', ruleVersionId: version.id }));
    const second = await database.transaction(tx => allocateBusinessNumber(tx, { ...base, allocationKey: 'two', ruleVersionId: next.id }));
    expect(first).toBe('QA20261011000001'); expect(second).toBe('NEW20261011000002');
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...base, allocationKey: 'one', ruleVersionId: next.id }))).toBe(first);
  });

  it('rejects foreign tenant versions and mismatched rule/version pairs', async () => {
    const a = await fixture({ tenantId: tenantA }); const b = await fixture({ tenantId: tenantB });
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'isolation', allocationKey: 'a', at };
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, ruleVersionId: b.version.id }))).rejects.toThrow('作用域');
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, ruleVersionId: a.version.id, ruleId: b.rule.id }))).rejects.toThrow('不匹配');
  });

  it('resolves exact tenant and owner bindings ahead of inherited defaults', async () => {
    const global = await fixture();
    const own = await fixture({ tenantId: tenantA, config: { template: 'OWN{YYYYMMDD}{SEQ:6}' } });
    const ownerKey = 'binding-precedence';
    await database.insert(schema.numberingBindings).values([
      { scene: 'workflow.instance', tenantId: null, ownerKey, ruleId: global.rule.id, versionId: global.version.id },
      { scene: 'workflow.instance', tenantId: tenantA, ownerKey, ruleId: own.rule.id, versionId: own.version.id },
    ]);
    const request = { scene: 'workflow.instance', ownerKey, allocationKey: 'bound', at };
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, tenantId: tenantA }))).toBe('OWN20261011000001');
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, tenantId: tenantB }))).toBe('QA20261011000001');
  });

  it('does not silently reassign a previously attached business number', async () => {
    const { version } = await fixture();
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'immutable-reference', ruleVersionId: version.id, allocationKey: 'one', at };
    const number = await database.transaction(async tx => {
      const allocated = await allocateBusinessNumber(tx, request);
      await attachBusinessNumber(tx, { ...request, number: allocated, businessKey: '100' });
      return allocated;
    });
    await expect(database.transaction(tx => attachBusinessNumber(tx, { ...request, number, businessKey: '101' }))).rejects.toThrow('找不到');
    const [receipt] = await database.select().from(schema.numberingAllocations).where(eq(schema.numberingAllocations.versionId, version.id));
    expect(receipt.businessKey).toBe('100');
  });

  it('lists actual default and frozen workflow usage without exposing internal owner bindings or foreign tenants', async () => {
    const { rule, version } = await fixture();
    const [newVersion] = await database.insert(schema.numberingVersions).values({ ruleId: rule.id, version: 2, config: { ...rule.draft, template: 'NEW{YYYYMMDD}{SEQ:6}' } }).returning();
    await database.insert(schema.numberingBindings).values([
      { scene: 'workflow.instance', tenantId: null, ownerKey: '*', ruleId: rule.id, versionId: newVersion.id },
      { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'management-view', ruleId: rule.id, versionId: newVersion.id },
    ]);
    const [workflow] = await database.insert(schema.workflowDefinitions).values([
      { name: 'Frozen QA workflow', tenantId: tenantA, status: 'published', flowData: { settings: { numbering: { ruleId: rule.id, versionId: version.id, parameterMapping: {} } } } },
      { name: 'Foreign QA workflow', tenantId: tenantB, status: 'published', flowData: { settings: { numbering: { ruleId: rule.id, versionId: newVersion.id, parameterMapping: {} } } } },
    ]).returning();
    const result = await runWithCurrentUser({ userId: actorId, username: 'qa', tenantId: tenantA, roles: ['operator'] }, () => listNumberingRuleUsages(rule.id));
    expect(result).toHaveLength(2);
    expect(result.find(item => item.kind === 'default')).toMatchObject({ version: 2, versionId: newVersion.id, tenantId: null });
    expect(result.find(item => item.kind === 'workflow')).toMatchObject({ name: 'Frozen QA workflow', version: 1, versionId: version.id, tenantId: tenantA, objectKey: String(workflow.id) });
    expect(result.some(item => item.name === 'Foreign QA workflow' || item.objectKey === 'management-view')).toBe(false);
  });

  it('serializes concurrent default edits, preserves fixed workflow references and restores tenant inheritance', async () => {
    const platform = await database.select().from(schema.numberingBindings).where(eq(schema.numberingBindings.ownerKey, '*'));
    const base = platform.find(item => item.scene === 'workflow.instance' && item.tenantId === null)!;
    const { rule, version } = await fixture({ tenantId: tenantA, config: { template: 'TENANT{YYYYMMDD}{SEQ:6}' } });
    const asActor = <T>(run: () => Promise<T>) => runWithCurrentUser({ userId: actorId, username: 'qa', tenantId: tenantA, roles: ['operator'] }, run);
    const initial = (await asActor(listNumberingDefaults)).find(item => item.scene === 'workflow.instance')!;
    expect(initial).toMatchObject({ ruleId: base.ruleId, versionId: base.versionId, inherited: true, expectedVersionId: null, canUpdate: true, canReset: false });
    const edits = await Promise.allSettled(Array.from({ length: 2 }, () => asActor(() => updateNumberingDefault('workflow.instance', {
      ruleId: rule.id, versionId: version.id, expectedVersionId: null,
    }))));
    expect(edits.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(edits.filter(item => item.status === 'rejected')).toHaveLength(1);
    const own = (await asActor(listNumberingDefaults)).find(item => item.scene === 'workflow.instance')!;
    expect(own).toMatchObject({ ruleId: rule.id, versionId: version.id, inherited: false, expectedVersionId: version.id, canReset: true });
    const usages = await asActor(() => listNumberingRuleUsages(base.ruleId));
    expect(usages.find(item => item.name === 'Frozen QA workflow')).toMatchObject({ version: 1 });
    const restored = await asActor(() => resetNumberingDefault('workflow.instance', { expectedVersionId: version.id }));
    expect(restored).toMatchObject({ ruleId: base.ruleId, versionId: base.versionId, inherited: true, expectedVersionId: null, canReset: false });
  });

  it('uses the configured timezone for midnight and period rollover', async () => {
    const { version } = await fixture();
    const base = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'clock', ruleVersionId: version.id };
    const first = await database.transaction(tx => allocateBusinessNumber(tx, { ...base, allocationKey: 'before', at: new Date('2026-10-11T15:59:59Z') }));
    const next = await database.transaction(tx => allocateBusinessNumber(tx, { ...base, allocationKey: 'after', at: new Date('2026-10-11T16:00:00Z') }));
    expect(first).toBe('QA20261011000001'); expect(next).toBe('QA20261012000001');
  });

  it('prevents collisions between rules in the same uniqueness domain', async () => {
    const a = await fixture(); const b = await fixture();
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'collision', allocationKey: 'a', at };
    await database.transaction(tx => allocateBusinessNumber(tx, { ...request, ruleVersionId: a.version.id }));
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'b', ruleVersionId: b.version.id }))).rejects.toThrow('重复号码');
    expect(await database.$count(schema.numberingCounters, eq(schema.numberingCounters.ruleId, b.rule.id))).toBe(0);
  });

  it('enforces the shared global payment-order namespace across tenants and scenes', async () => {
    const a = await fixture({ scene: 'payment.order', config: { scope: 'global' } });
    const b = await fixture({ scene: 'payment.deduction', config: { scope: 'global' } });
    await database.transaction(tx => allocateBusinessNumber(tx, { scene: 'payment.order', tenantId: tenantA, ruleVersionId: a.version.id, allocationKey: 'a', at }));
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { scene: 'payment.deduction', tenantId: tenantB, ruleVersionId: b.version.id, allocationKey: 'b', at }))).rejects.toThrow('重复号码');
  });

  it('allocates zero-based advanced templates with independent sequence widths and multiple form values', async () => {
    const { rule, version } = await fixture({ config: {
      template: '{FORM.类型}-{SEQ:2}-{YY}-{FORM.区域}-{SEQ:4}-{DEPT_CODE}',
      start: '0', width: 4, resetPeriod: 'never',
    } });
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'advanced-zero', ruleVersionId: version.id, at,
      context: { 'FORM.类型': 'QJ', 'FORM.区域': 'EAST', departmentCode: 'RD' } };
    const first = await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'first' }));
    expect(first).toBe('QJ-00-26-EAST-0000-RD');
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'first' }))).toBe(first);
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'first',
      context: { ...request.context, 'FORM.区域': 'WEST' },
    }))).rejects.toThrow('业务参数发生变化');
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'second' })))
      .toBe('QJ-01-26-EAST-0001-RD');
    const [counter] = await database.select().from(schema.numberingCounters).where(eq(schema.numberingCounters.ruleId, rule.id));
    expect(counter.value).toBe(1n);
    expect(await database.$count(schema.numberingAllocations, eq(schema.numberingAllocations.ruleId, rule.id))).toBe(2);
  });

  it('rolls back a collision from freely composed department identifiers without silently skipping a number', async () => {
    const { rule, version } = await fixture({ config: {
      template: 'C{departmentId}{SEQ:1}', start: '0', width: 1, resetPeriod: 'never', scope: 'department',
    } });
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'free-template', ruleVersionId: version.id, at };
    for (let index = 0; index <= 10; index++) {
      await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: `dept1:${index}`, context: { departmentId: 1 } }));
    }
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: 'dept11:0', context: { departmentId: 11 } })))
      .rejects.toThrow('重复号码');
    const counters = await database.select().from(schema.numberingCounters).where(eq(schema.numberingCounters.ruleId, rule.id));
    expect(counters).toHaveLength(1);
    expect(counters[0].value).toBe(10n);
    expect(await database.$count(schema.numberingAllocations, eq(schema.numberingAllocations.ruleId, rule.id))).toBe(11);
  });

  it('keeps values above JavaScript safe integer exact and fails on bigint exhaustion', async () => {
    const { version } = await fixture({ config: { start: '9223372036854775806', width: 19, template: 'QA{YYYYMMDD}{SEQ:19}' } });
    const request = { scene: 'workflow.instance', tenantId: tenantA, ownerKey: 'bigint', ruleVersionId: version.id, at };
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: '1' }))).toBe('QA202610119223372036854775806');
    expect(await database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: '2' }))).toBe('QA202610119223372036854775807');
    await expect(database.transaction(tx => allocateBusinessNumber(tx, { ...request, allocationKey: '3' }))).rejects.toThrow('上限');
  });
});
