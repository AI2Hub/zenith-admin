import { createHash } from 'node:crypto';
import { asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { getNumberingScene, renderBusinessNumber, resolveNumberingPeriodKey, validateNumberingConfig } from '@zenith/shared/platform';
import type { NumberingConfig } from '@zenith/shared/platform';
import type { DbTransaction } from '../../db/types';
import { numberingAllocations, numberingBindings, numberingCounters, numberingRules, numberingVersions } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import { getPgConstraintName } from '../../lib/db-errors';
import { exactTenantCondition, inheritedTenantCondition } from '../../lib/tenant';
import { buildWhere } from '../../lib/where-helpers';

export interface NumberingRequest {
  scene: string;
  tenantId: number | null;
  ownerKey?: string;
  ruleId?: number;
  ruleVersionId?: number;
}

function sceneFor(code: string) {
  try { return getNumberingScene(code); }
  catch { throw new HTTPException(400, { message: '业务编号接入点未注册' }); }
}

/** Resolve once inside the caller's transaction; published workflow snapshots pass a fixed version. */
export async function resolveNumberingVersion(tx: DbTransaction, request: NumberingRequest) {
  const scene = sceneFor(request.scene);
  const ownerKey = request.ownerKey ?? '*';
  let versionId = request.ruleVersionId;
  let ruleId = request.ruleId;
  let binding: typeof numberingBindings.$inferSelect | undefined;
  if (versionId === undefined && ruleId === undefined) {
    const candidates = await tx.select().from(numberingBindings).where(buildWhere(
      eq(numberingBindings.scene, request.scene),
      inArray(numberingBindings.ownerKey, ownerKey === '*' ? ['*'] : [ownerKey, '*']),
      inheritedTenantCondition(numberingBindings.tenantId, request.tenantId),
    )).orderBy(asc(numberingBindings.id));
    binding = candidates.sort((a, b) => {
      const rank = (row: typeof a) => (row.tenantId === request.tenantId ? 2 : 0) + (row.ownerKey === ownerKey ? 1 : 0);
      return rank(b) - rank(a);
    })[0];
    if (!binding) throw new HTTPException(409, { message: `「${scene.label}」尚未绑定已发布的编号规则` });
    versionId = binding.versionId;
    ruleId = binding.ruleId;
  }
  if (versionId !== undefined) {
    const [version] = await tx.select().from(numberingVersions).where(eq(numberingVersions.id, versionId)).limit(1);
    if (!version || (ruleId !== undefined && version.ruleId !== ruleId)) throw new HTTPException(400, { message: '编号规则与版本不匹配' });
    ruleId = version.ruleId;
  }
  // Shared lock protects rule status and the published sequence policy until allocation commits.
  const [rule] = await tx.select().from(numberingRules).where(buildWhere(
    eq(numberingRules.id, ruleId!), eq(numberingRules.scene, request.scene),
    inheritedTenantCondition(numberingRules.tenantId, request.tenantId),
  )).for('share').limit(1);
  if (!rule || rule.status !== 'enabled' || (!scene.tenantCustomizable && rule.tenantId !== null)) {
    throw new HTTPException(409, { message: '编号规则不存在、已停用或不属于当前业务作用域' });
  }
  const [version] = await tx.select().from(numberingVersions).where(buildWhere(
    eq(numberingVersions.ruleId, rule.id),
    versionId === undefined ? eq(numberingVersions.version, rule.currentVersion) : eq(numberingVersions.id, versionId),
  )).orderBy(desc(numberingVersions.version)).limit(1);
  if (!version) throw new HTTPException(409, { message: '编号规则尚未发布' });
  return { rule, version, binding };
}

export async function getNumberingReference(tx: DbTransaction, request: NumberingRequest) {
  const { rule, version, binding } = await resolveNumberingVersion(tx, request);
  return { ruleId: rule.id, versionId: version.id, parameterMapping: binding?.parameterMapping ?? {} };
}

/** Sequence policy is immutable after the first publication so concurrently used versions cannot diverge. */
export function numberingSequencePolicy(config: NumberingConfig): string {
  return JSON.stringify([config.start, config.step, config.resetPeriod, config.timezone, config.scope]);
}

function normalizedContext(request: NumberingRequest, context: Record<string, string | number>) {
  return { ...context, tenantId: String(request.tenantId ?? 0), ownerKey: request.ownerKey ?? '*' };
}

function scopeFor(config: NumberingConfig, request: NumberingRequest, context: Record<string, string | number>): string {
  const tenant = `tenant:${request.tenantId ?? 0}`;
  switch (config.scope) {
    case 'global': return 'global';
    case 'tenant': return tenant;
    case 'owner':
      if (!request.ownerKey || request.ownerKey === '*') throw new HTTPException(400, { message: '按业务对象计数需要明确的归属标识' });
      return `${tenant}/owner:${request.ownerKey}`;
    case 'department':
      if (!context.departmentId || !/^\d+$/.test(String(context.departmentId))) throw new HTTPException(400, { message: '按组织计数需要有效的部门标识' });
      return `${tenant}/department:${context.departmentId}`;
  }
}

export interface AllocateBusinessNumberInput extends NumberingRequest {
  allocationKey: string;
  context?: Record<string, string | number>;
  /** Trusted event time, never a browser-supplied clock. */
  at?: Date;
}

/**
 * Allocate in the business transaction. The operation lock comes before the counter lock;
 * replays never consume another number, including after a binding/version change.
 * No network I/O or transaction creation is permitted in this function.
 */
export async function allocateBusinessNumber(tx: DbTransaction, input: AllocateBusinessNumberInput): Promise<string> {
  const scene = sceneFor(input.scene);
  const ownerKey = input.ownerKey ?? '*';
  if (scene.uniqueScope === 'owner' && ownerKey === '*') throw new HTTPException(400, { message: '当前业务需要明确的编号归属对象' });
  if (!input.allocationKey || input.allocationKey.length > 200 || ownerKey.length > 128) {
    throw new HTTPException(400, { message: '编号分配需要有效且稳定的业务操作标识' });
  }
  const context = normalizedContext(input, input.context ?? {});
  const contextHash = createHash('sha256').update(JSON.stringify(Object.entries(context).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  const operationKey = JSON.stringify(['numbering', input.scene, input.tenantId, ownerKey, input.allocationKey]);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`);
  const [existing] = await tx.select({ number: numberingAllocations.number, contextHash: numberingAllocations.contextHash })
    .from(numberingAllocations).where(buildWhere(
      eq(numberingAllocations.scene, input.scene), exactTenantCondition(numberingAllocations.tenantId, input.tenantId),
      eq(numberingAllocations.ownerKey, ownerKey), eq(numberingAllocations.allocationKey, input.allocationKey),
    )).limit(1);
  if (existing) {
    if (existing.contextHash !== contextHash) throw new HTTPException(409, { message: '同一编号分配请求的业务参数发生变化' });
    return existing.number;
  }
  const { rule, version } = await resolveNumberingVersion(tx, input);
  const errors = validateNumberingConfig(version.config, input.scene);
  if (errors.length) throw new HTTPException(409, { message: errors[0] });
  const now = input.at ?? new Date();
  const scopeKey = scopeFor(version.config, input, context);
  const periodKey = resolveNumberingPeriodKey(version.config, now);
  const step = BigInt(version.config.step);
  const [counter] = await tx.insert(numberingCounters).values({
    ruleId: rule.id, scopeKey, periodKey, value: BigInt(version.config.start),
  }).onConflictDoUpdate({
    target: [numberingCounters.ruleId, numberingCounters.scopeKey, numberingCounters.periodKey],
    set: { value: sql`${numberingCounters.value} + ${step.toString()}::bigint` },
    setWhere: sql`${numberingCounters.value} <= 9223372036854775807::bigint - ${step.toString()}::bigint`,
  }).returning({ value: numberingCounters.value });
  if (!counter) throw new HTTPException(409, { message: '编号流水已达到上限，请配置新的编号序列' });
  let number: string;
  try { number = renderBusinessNumber(version.config, { sequence: counter.value, at: now, context }, input.scene); }
  catch (error) { throw new HTTPException(400, { message: error instanceof Error ? error.message : '无法生成业务编号' }); }
  const uniqueScope = scene.uniqueScope === 'global' ? 'global'
    : scene.uniqueScope === 'tenant' ? `tenant:${input.tenantId ?? 0}`
      : `tenant:${input.tenantId ?? 0}/owner:${ownerKey}`;
  try {
    await tx.insert(numberingAllocations).values({
      scene: input.scene, tenantId: input.tenantId, ownerKey, allocationKey: input.allocationKey,
      ruleId: rule.id, versionId: version.id, number, uniqueNamespace: scene.uniqueNamespace, uniqueScope, contextHash,
    });
  } catch (error) {
    if (getPgConstraintName(error) === 'numbering_allocations_number_unique') {
      throw new HTTPException(409, { message: '编号规则产生了重复号码，请调整规则；本次业务未提交' });
    }
    throw error;
  }
  return number;
}

/** Attach only after the business row exists, in the same transaction as its allocation. */
export async function attachBusinessNumber(tx: DbTransaction, input: { scene: string; tenantId: number | null; ownerKey?: string; number: string; businessKey: string }) {
  const rows = await tx.update(numberingAllocations).set({ businessKey: input.businessKey }).where(buildWhere(
    eq(numberingAllocations.scene, input.scene), eq(numberingAllocations.number, input.number),
    eq(numberingAllocations.ownerKey, input.ownerKey ?? '*'),
    or(isNull(numberingAllocations.businessKey), eq(numberingAllocations.businessKey, input.businessKey)),
    exactTenantCondition(numberingAllocations.tenantId, input.tenantId),
  )).returning({ id: numberingAllocations.id });
  requireRow(rows[0], '找不到本次业务的编号分配记录', 409);
}
