/**
 * Real PostgreSQL coverage for the settings write and history services.
 * Explicitly enabled against the existing local development database after migrations.
 * Tenant fixtures are unique; platform changes and injected failure triggers are rolled back.
 * Uses its own connections; shared platform changes are rolled back and services are not restarted.
 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDoc, SettingsModuleKey } from '@zenith/shared/settings';
import { describeSettingsDefinition } from '@zenith/shared/settings';
import { createPgClient } from '../../db/client';
import type { Db, DbExecutor, DbTransaction } from '../../db/types';
import type { JwtPayload } from '../../middleware/auth';
import * as schema from '../../db/schema';

const bridge = vi.hoisted(() => ({ executor: undefined as DbExecutor | undefined }));

// Keep the real SQL builders and transactions, substituting only their connection owner.
vi.mock('../../db', () => ({
  db: new Proxy({}, {
    get(_target, property) {
      const executor = bridge.executor;
      if (!executor) throw new Error('Integration database has not been initialized');
      const value = Reflect.get(executor, property);
      return typeof value === 'function' ? value.bind(executor) : value;
    },
  }),
  readSnapshot: (fn: (tx: DbTransaction) => Promise<unknown>) => {
    if (!bridge.executor) throw new Error('Integration database has not been initialized');
    return bridge.executor.transaction(fn);
  },
}));
vi.mock('../../config', () => ({ config: { multiTenantMode: true, settings: { cacheTtlMs: 60_000 }, licenseMode: 'off' } }));
vi.mock('../context', () => ({ currentUserOrNull: () => undefined, currentUser: () => { throw new Error('No request actor'); }, setAuditBefore: vi.fn(), setAuditAfter: vi.fn() }));
vi.mock('../member-context', () => ({ currentMemberOrNull: () => undefined }));
vi.mock('../licensing', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('../tenant-package', () => ({ getTenantPackageFeatureSet: vi.fn(async () => null) }));
vi.mock('../permissions', () => ({ getUserPermissions: vi.fn(async () => []), isSuperAdmin: () => false }));
vi.mock('../logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../invalidation-bus', () => ({ onInvalidate: vi.fn(), onInvalidationReset: vi.fn() }));
vi.mock('../ws-manager', () => ({ scheduleBroadcast: vi.fn(), onBroadcastMessage: vi.fn() }));

const integration = describe.skipIf(process.env.RUN_SETTINGS_DB_TESTS !== '1');

integration('settings immutable revisions on real PostgreSQL', () => {
  let client: ReturnType<typeof createPgClient> | undefined;
  let review: Db;
  let runtime: typeof import('./index');
  let history: typeof import('../../services/platform/settings-history.service');
  const tenantIds: number[] = [];
  let actor: JwtPayload;
  let outsider: JwtPayload;
  const platformActor: JwtPayload = { userId: 1, username: 'settings-integration-platform', roles: ['super_admin'], tenantId: null };
  const module = 'identitySecurity' as const;

  beforeAll(async () => {
    const { config } = await vi.importActual<typeof import('../../config')>('../../config');
    const testDatabaseUrl = config.databaseUrl;
    const url = new URL(testDatabaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Settings integration tests require the existing local development database');
    }
    client = createPgClient(testDatabaseUrl, { max: 6, connect_timeout: 5, onnotice: () => undefined });
    review = drizzle(client, { schema, casing: 'snake_case' });
    bridge.executor = review;
    runtime = await import('./index');
    history = await import('../../services/platform/settings-history.service');
  });

  async function cleanupTenants() {
    if (!review || tenantIds.length === 0) return;
    // Owner deletion permits the revision cascade; direct revision deletion must remain forbidden.
    await review.delete(schema.systemSettings).where(inArray(schema.systemSettings.tenantId, tenantIds));
    await review.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    tenantIds.length = 0;
  }

  beforeEach(async () => {
    bridge.executor = review;
    runtime.resetSettingsCache();
    const suffix = randomUUID().slice(0, 8);
    const rows = await review.insert(schema.tenants).values([
      { code: `settings-it-a-${suffix}`, name: `Settings integration A ${suffix}` },
      { code: `settings-it-b-${suffix}`, name: `Settings integration B ${suffix}` },
    ]).returning({ id: schema.tenants.id });
    tenantIds.push(...rows.map((row) => row.id));
    // Revision actor identity is an immutable attribution snapshot, with no users FK.
    actor = { userId: rows[0].id, username: `settings-it-${suffix}`, roles: ['tenant_admin'], tenantId: rows[0].id };
    outsider = { userId: rows[1].id, username: `settings-other-${suffix}`, roles: ['tenant_admin'], tenantId: rows[1].id };
  });

  afterEach(async () => {
    bridge.executor = review;
    runtime?.resetSettingsCache();
    await cleanupTenants();
  });

  afterAll(async () => {
    try { await cleanupTenants(); }
    finally { bridge.executor = undefined; await client?.end({ timeout: 1 }); }
  });

  const envelope = async (tenantId: number | null = actor.tenantId) =>
    runtime.toSettingsEnvelope(await runtime.loadSettingsEntry(bridge.executor!, module, tenantId));

  async function heads(tenantId: number | null = actor.tenantId) {
    return bridge.executor!.select().from(schema.systemSettings)
      .where(and(eq(schema.systemSettings.module, module), tenantId === null ? sql`${schema.systemSettings.tenantId} is null` : eq(schema.systemSettings.tenantId, tenantId)));
  }

  async function ownedRevisions() {
    return bridge.executor!.select({ revision: schema.systemSettingsRevisions }).from(schema.systemSettingsRevisions)
      .innerJoin(schema.systemSettings, eq(schema.systemSettingsRevisions.settingsId, schema.systemSettings.id))
      .where(and(eq(schema.systemSettings.module, module), eq(schema.systemSettings.tenantId, actor.tenantId!)));
  }

  async function save(overrides: SettingsDoc, note = 'integration save') {
    const before = await envelope();
    return runtime.saveSettings(module, actor, { baseToken: before.baseToken, overrides, note });
  }

  /** Test nested writes against actual savepoints, then roll back platform changes and test-only DDL. */
  async function rollbackFixture(run: (tx: DbTransaction) => Promise<void>) {
    const rollback = new Error('rollback isolated settings fixture');
    try {
      await review.transaction(async (tx) => {
        bridge.executor = tx;
        await run(tx);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      bridge.executor = review;
      runtime.resetSettingsCache();
    }
  }

  it('serializes concurrent first saves: one complete revision/head, every other writer receives 409', async () => {
    const before = await envelope();
    expect(before.version).toBe(0);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => runtime.saveSettings(module, actor, {
      baseToken: before.baseToken, overrides: { password: { minLength: 8 + index } }, note: `writer ${index}`,
    })));
    const successes = attempts.filter((result) => result.status === 'fulfilled');
    const failures = attempts.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(5);
    for (const result of failures) expect(result.reason).toMatchObject({ status: 409 });
    const saved = successes[0].value;
    const rows = await heads();
    const records = await ownedRevisions();
    expect(rows).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(rows[0].currentRevisionId).toBe(records[0].revision.id);
    expect(saved.currentRevisionId).toBe(records[0].revision.id);
    expect(records[0].revision).toMatchObject({ version: 1, action: 'save', overrides: saved.overrides,
      effective: saved.effective, inherited: saved.inherited, inheritedVersion: saved.inheritedVersion,
      definitionHash: saved.definitionHash, actorId: actor.userId, actorName: actor.username });
    expect(describeSettingsDefinition(records[0].revision.definition)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'password.minLength', type: 'integer' }),
    ]));
    expect(records[0].revision.changedPaths).toEqual(['password.minLength']);
  });

  it('preserves explicitly equal overrides and skips no-op revisions', async () => {
    const initial = await envelope();
    const value = initial.inherited.password.minLength;
    const saved = await save({ password: { minLength: value } });
    expect(saved.version).toBe(1);
    expect(saved.overriddenPaths).toEqual(['password.minLength']);
    expect(saved.effective.password.minLength).toBe(saved.inherited.password.minLength);
    const repeated = await runtime.saveSettings(module, actor, { baseToken: saved.baseToken, overrides: saved.overrides, note: 'explanation only' });
    expect(repeated.version).toBe(saved.version);
    expect(repeated.currentRevisionId).toBe(saved.currentRevisionId);
    expect(await ownedRevisions()).toHaveLength(1);
  });

  it('rejects stale tenant tokens after parent changes and retains current inherited values when restoring', async () => {
    await rollbackFixture(async () => {
      const first = await save({ password: { minLength: 8 } });
      const second = await save({ password: { minLength: 12 } });
      const oldParent = await envelope(null);
      const parentValue = !oldParent.effective.password.requireUppercase;
      const parentOverrides = {
        ...oldParent.overrides,
        password: { ...(oldParent.overrides.password as SettingsDoc | undefined), requireUppercase: parentValue },
      };
      const parent = await runtime.saveSettings(module, platformActor, { baseToken: oldParent.baseToken, overrides: parentOverrides });
      await expect(runtime.saveSettings(module, actor, { baseToken: second.baseToken, overrides: { password: { minLength: 14 } } }))
        .rejects.toMatchObject({ status: 409 });
      const current = await envelope();
      expect(current.version).toBe(second.version);
      expect(current.baseToken).not.toBe(second.baseToken);
      expect(current.inheritedVersion).toBe(parent.version);
      const preview = await history.previewSettingsRestore(module, actor, first.version, { baseToken: current.baseToken });
      expect(preview.issues).toEqual([]);
      expect(preview.restored.password).toMatchObject({ minLength: 8, requireUppercase: parentValue });
      const restored = await runtime.restoreSettings(module, actor, first.version, { baseToken: preview.baseToken, note: 'restore own overrides' });
      expect(restored.version).toBe(3);
      expect(restored.overrides).toEqual(first.overrides);
      expect(restored.effective.password).toMatchObject({ minLength: 8, requireUppercase: parentValue });
      expect(restored.inheritedVersion).toBe(parent.version);
      const record = await history.getSettingsVersion(module, actor, restored.version);
      expect(record).toMatchObject({ action: 'restore', restoredFromVersion: first.version, inheritedVersion: parent.version });
      expect(await history.getSettingsVersion(module, actor, first.version)).toMatchObject({ effective: first.effective, overrides: first.overrides });
      const compared = await history.compareSettingsVersions(module, actor, { from: first.version, to: restored.version });
      expect(compared.changes).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'password.requireUppercase', inheritanceChanged: false, valueChanged: true })]));
    });
  });

  it('restores v0 by clearing local overrides, creating a new revision with current parent inheritance', async () => {
    const saved = await save({ password: { minLength: 12 }, mfa: { enabled: true } });
    const baseline = await history.getSettingsVersion(module, actor, 0);
    expect(baseline).toMatchObject({ id: 0, version: 0, createdAt: null, overrides: {}, effective: saved.inherited });
    const preview = await history.previewSettingsRestore(module, actor, 0, { baseToken: saved.baseToken });
    expect(preview.restored).toEqual(saved.inherited);
    const restored = await runtime.restoreSettings(module, actor, 0, { baseToken: preview.baseToken, note: 'inherit all fields' });
    expect(restored.version).toBe(2);
    expect(restored.overrides).toEqual({});
    expect(restored.effective).toEqual(restored.inherited);
    expect(await history.getSettingsVersion(module, actor, 2)).toMatchObject({ action: 'restore', restoredFromVersion: 0 });
  });

  it('history lookup, comparison and restore cannot cross tenant or module boundaries', async () => {
    const saved = await save({ password: { minLength: 9 } });
    await expect(history.getSettingsVersion(module, outsider, saved.version)).rejects.toMatchObject({ status: 404 });
    await expect(history.compareSettingsVersions(module, outsider, { from: 0, to: saved.version })).rejects.toMatchObject({ status: 404 });
    const otherBase = await envelope(outsider.tenantId);
    await expect(history.previewSettingsRestore(module, outsider, saved.version, { baseToken: otherBase.baseToken })).rejects.toMatchObject({ status: 404 });
    await expect(runtime.restoreSettings(module, outsider, saved.version, { baseToken: otherBase.baseToken, note: 'must not cross tenants' })).rejects.toMatchObject({ status: 404 });
    await expect(history.getSettingsVersion('drive' satisfies SettingsModuleKey, actor, saved.version)).rejects.toMatchObject({ status: 404 });
    expect((await history.listSettingsVersions(module, outsider, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await history.listSettingsVersions(module, actor, { page: 1, pageSize: 10 })).list.map((item) => item.version)).toEqual([1]);
  });

  it('invalid leaf and unknown field writes leave both the head and history untouched', async () => {
    const before = await envelope();
    for (const overrides of [{ password: { minLength: 0 } }, { password: { unsupported: true } }]) {
      await expect(runtime.saveSettings(module, actor, { baseToken: before.baseToken, overrides })).rejects.toMatchObject({ status: 400 });
    }
    expect(await heads()).toEqual([]);
    expect(await ownedRevisions()).toEqual([]);
    expect(await envelope()).toEqual(before);
    const saved = await save({ password: { minLength: 9 } });
    await expect(runtime.saveSettings(module, actor, { baseToken: saved.baseToken, overrides: { mfa: { enabled: 'invalid' } } })).rejects.toMatchObject({ status: 400 });
    expect(await ownedRevisions()).toHaveLength(1);
    expect((await envelope()).currentRevisionId).toBe(saved.currentRevisionId);
  });

  it('rolls back the inserted head and revision if switching the pointer fails', async () => {
    await rollbackFixture(async (tx) => {
      const name = `settings_it_fail_${randomUUID().replaceAll('-', '')}`;
      const identifier = sql.identifier(name);
      await tx.execute(sql`create function ${identifier}() returns trigger language plpgsql as $$ begin raise exception 'injected head failure' using errcode = 'P0001'; end $$`);
      // Fixture IDs come from PostgreSQL, so this DDL literal is a validated integer, never user input.
      const tenantLiteral = sql.raw(String(actor.tenantId));
      await tx.execute(sql`create trigger ${identifier} before update on system_settings for each row when (new.tenant_id = ${tenantLiteral}) execute function ${identifier}()`);
      const before = await envelope();
      await expect(runtime.saveSettings(module, actor, { baseToken: before.baseToken, overrides: { password: { minLength: 10 } } }))
        .rejects.toMatchObject({ cause: { code: 'P0001' } });
      expect(await heads()).toEqual([]);
      expect(await ownedRevisions()).toEqual([]);
      expect((await envelope()).version).toBe(0);
    });
  });

  it('database triggers reject direct UPDATE and DELETE of immutable revisions', async () => {
    const saved = await save({ password: { minLength: 10 } });
    await expect(review.execute(sql`update system_settings_revisions set note = 'tamper' where id = ${saved.currentRevisionId}`))
      .rejects.toMatchObject({ cause: { code: '55000' } });
    await expect(review.execute(sql`delete from system_settings_revisions where id = ${saved.currentRevisionId}`))
      .rejects.toMatchObject({ cause: { code: '55000' } });
    expect((await history.getSettingsVersion(module, actor, saved.version)).note).toBe('integration save');
    expect((await envelope()).currentRevisionId).toBe(saved.currentRevisionId);
    expect(await ownedRevisions()).toHaveLength(1);
  });
});
