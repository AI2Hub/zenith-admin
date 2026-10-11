import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { closeDb } from '../../db';
import { createPgClient } from '../../db/client';
import * as tables from '../../db/schema';
import { runWithCurrentUser } from '../../lib/context';
import { createBizLeave, deleteBizLeave, updateBizLeave } from './biz-leave.service';

const databaseUrl = process.env.NUMBERING_TEST_DATABASE_URL;
const isolated = databaseUrl && /^\/zenith_numbering_qa_\d+$/.test(new URL(databaseUrl).pathname);
const integration = isolated ? describe : describe.skip;

integration('leave numbering in the real business transaction', () => {
  const client = createPgClient(databaseUrl ?? 'postgres://localhost/unused', { max: 2 });
  const database = drizzle(client, { schema: tables, casing: 'snake_case' });
  let actorId: number;
  let ruleId: number;
  const body = { leaveType: 'annual' as const, startDate: '2026-10-12', endDate: '2026-10-13', days: 2, reason: 'QA numbering integration' };
  const asActor = <T>(run: () => Promise<T>) => runWithCurrentUser({ userId: actorId, username: 'qa_leave', tenantId: null, roles: [] }, run);

  beforeAll(async () => {
    const [{ name }] = await client<{ name: string }[]>`select current_database() as name`;
    expect(name).toMatch(/^zenith_numbering_qa_\d+$/);
    const [actor] = await database.insert(tables.users).values({ username: `qa_leave_${Date.now()}`, nickname: '编号测试', password: 'unused-test-fixture' }).returning();
    actorId = actor.id;
    const config = { template: 'LV{YYYYMMDD}{SEQ:6}', start: '1', step: '1', width: 6, resetPeriod: 'daily' as const, timezone: 'Asia/Shanghai', scope: 'tenant' as const };
    const [rule] = await database.insert(tables.numberingRules).values({ code: `qa.leave.${Date.now()}`, name: 'Leave QA', scene: 'biz.leave', draft: config, currentVersion: 1 }).returning();
    ruleId = rule.id;
    const [version] = await database.insert(tables.numberingVersions).values({ ruleId, version: 1, config }).returning();
    await database.insert(tables.numberingBindings).values({ scene: 'biz.leave', ownerKey: '*', ruleId, versionId: version.id });
  });
  afterAll(async () => { await client.end(); await closeDb(); });

  it('persists a linked number and retains its receipt after editing and deleting the draft', async () => {
    const leave = await asActor(() => createBizLeave(body));
    expect(leave.leaveNo).toMatch(/^LV\d{14}$/);
    const [receipt] = await database.select().from(tables.numberingAllocations).where(eq(tables.numberingAllocations.ruleId, ruleId));
    expect(receipt).toMatchObject({ businessKey: String(leave.id), number: leave.leaveNo, allocationKey: String(leave.id) });
    const changed = await asActor(() => updateBizLeave(leave.id, { reason: 'edited' }));
    expect(changed.leaveNo).toBe(leave.leaveNo);
    await asActor(() => deleteBizLeave(leave.id));
    expect(await database.$count(tables.bizLeaves, eq(tables.bizLeaves.id, leave.id))).toBe(0);
    expect(await database.$count(tables.numberingAllocations, eq(tables.numberingAllocations.ruleId, ruleId))).toBe(1);
  });

  it('rolls back the new leave row when its configured numbering rule cannot allocate', async () => {
    await database.update(tables.numberingRules).set({ status: 'disabled' }).where(eq(tables.numberingRules.id, ruleId));
    await expect(asActor(() => createBizLeave(body))).rejects.toThrow('停用');
    expect(await database.$count(tables.bizLeaves, eq(tables.bizLeaves.createdBy, actorId))).toBe(0);
    expect(await database.$count(tables.numberingAllocations, eq(tables.numberingAllocations.ruleId, ruleId))).toBe(1);
    const [counter] = await database.select().from(tables.numberingCounters).where(eq(tables.numberingCounters.ruleId, ruleId));
    expect(counter.value).toBe(1n);
  });
});
