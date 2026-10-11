import { asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type * as z from 'zod';
import { HTTPException } from 'hono/http-exception';
import type { QueryOutputOf } from '@zenith/shared/core';
import {
  NUMBERING_SCENES, getNumberingScene, getNumberingTemplateBusinessParameters, numberingAllocationContract,
  numberingAllocationSchema, numberingRuleContract,
  numberingRuleSchema, numberingVersionSchema, previewBusinessNumbers,
  validateNumberingConfig,
} from '@zenith/shared/platform';
import type {
  createNumberingRuleSchema, updateNumberingRuleSchema, publishNumberingRuleSchema,
  resetNumberingDefaultSchema, updateNumberingDefaultSchema, numberingPreviewSchema, NumberingConfig, NumberingDefault, NumberingRuleUsage,
} from '@zenith/shared/platform';
import { db } from '../../db';
import type { DbExecutor, DbTransaction } from '../../db/types';
import { numberingAllocations, numberingBindings, numberingCounters, numberingRules, numberingVersions, workflowDefinitions, workflowInstances, tenants } from '../../db/schema';
import type { NumberingAllocationRow, NumberingRuleRow } from '../../db/schema/numbering';
import { currentUser } from '../../lib/context';
import { requireRow } from '../../lib/db-assert';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { entityMapper } from '../../lib/entity-map';
import { listRows } from '../../lib/list-query';
import { getCreateTenantId, getTenantScopeId, isPlatformAdmin, tenantScope, exactTenantCondition, inheritedTenantCondition } from '../../lib/tenant';
import { buildWhere, dateRangeConditions, keywordCondition } from '../../lib/where-helpers';
import { numberingSequencePolicy } from './numbering-runtime';
import { lockNumberingBinding } from './numbering-binding-lock';

const mapRule = entityMapper(numberingRuleSchema, (row: NumberingRuleRow) => ({ scene: getNumberingScene(row.scene).code }));
const mapVersion = entityMapper(numberingVersionSchema);
const mapAllocation = entityMapper(numberingAllocationSchema, (row: NumberingAllocationRow) => ({ scene: getNumberingScene(row.scene).code }));

function readableRuleScope() {
  const own = tenantScope(numberingRules);
  return own ? or(own, isNull(numberingRules.tenantId)) : undefined;
}

async function ensureNumberingRule(id: number, executor: DbExecutor = db, lock = false) {
  const own = tenantScope(numberingRules);
  const query = executor.select().from(numberingRules).where(buildWhere(
    eq(numberingRules.id, id), own ? or(own, isNull(numberingRules.tenantId)) : undefined,
  )).limit(1);
  const rows = lock ? await query.for('update') : await query;
  return requireRow(rows[0], '编号规则不存在');
}

/** 继承的平台模板只读；支付与内置规则的写权限始终限定平台管理员。 */
function requireRuleWrite(rule: Pick<NumberingRuleRow, 'tenantId' | 'scene' | 'isBuiltin'>) {
  const user = currentUser();
  if (isPlatformAdmin(user)) return;
  if (rule.isBuiltin || !getNumberingScene(rule.scene).tenantCustomizable || rule.tenantId !== getCreateTenantId(user)) {
    throw new HTTPException(403, { message: '只能修改当前租户自建的编号规则，平台模板与支付规则由平台管理员维护' });
  }
}

function requireValidConfig(config: NumberingConfig, scene: string) {
  const errors = validateNumberingConfig(config, scene);
  if (errors.length) throw new HTTPException(400, { message: errors.join('；') });
}

function requireRevision(rule: NumberingRuleRow, expectedRevision: number) {
  if (rule.revision !== expectedRevision) throw new HTTPException(409, { message: '编号规则已被其他人修改，请刷新后重试' });
}

async function requireStableSequence(tx: DbTransaction, rule: NumberingRuleRow, config: NumberingConfig) {
  if (!rule.currentVersion) return;
  const [published] = await tx.select().from(numberingVersions).where(buildWhere(
    eq(numberingVersions.ruleId, rule.id), eq(numberingVersions.version, 1),
  )).limit(1);
  if (!published || numberingSequencePolicy(published.config) !== numberingSequencePolicy(config)) {
    throw new HTTPException(409, { message: '已发布序列的起始值、步长、重置周期、时区和流水范围不能修改，请创建新规则' });
  }
}

export function listNumberingRules(q: QueryOutputOf<typeof numberingRuleContract.list>) {
  return listRows({ ...q, table: numberingRules, where: buildWhere(
    readableRuleScope(), keywordCondition(q.keyword, [numberingRules.name, numberingRules.code]),
    q.scene ? eq(numberingRules.scene, q.scene) : undefined, q.status ? eq(numberingRules.status, q.status) : undefined,
  ), orderBy: [desc(numberingRules.id)], map: mapRule });
}

export async function getNumberingRule(id: number) { return mapRule(await ensureNumberingRule(id)); }

export async function listAvailableNumberingRules(q: QueryOutputOf<typeof numberingRuleContract.all>) {
  const rows = await db.select({
    id: numberingRules.id, code: numberingRules.code, name: numberingRules.name, scene: numberingRules.scene,
    currentVersion: numberingRules.currentVersion, versionId: numberingVersions.id, config: numberingVersions.config,
  }).from(numberingRules).innerJoin(numberingVersions, buildWhere(
    eq(numberingVersions.ruleId, numberingRules.id), eq(numberingVersions.version, numberingRules.currentVersion),
  )).where(buildWhere(readableRuleScope(), eq(numberingRules.status, 'enabled'), q.scene ? eq(numberingRules.scene, q.scene) : undefined)).orderBy(asc(numberingRules.name));
  return rows.map(({ config, ...row }) => ({
    ...row, scene: getNumberingScene(row.scene).code, template: config.template,
    requiredParameters: getNumberingTemplateBusinessParameters(config.template),
  }));
}

export async function createNumberingRule(input: z.output<typeof createNumberingRuleSchema>) {
  const tenantId = getCreateTenantId(currentUser());
  requireRuleWrite({ tenantId, scene: input.scene, isBuiltin: false });
  if (!getNumberingScene(input.scene).tenantCustomizable && tenantId !== null) {
    throw new HTTPException(400, { message: '支付编号规则必须在平台视角创建' });
  }
  requireValidConfig(input.draft, input.scene);
  try {
    const [row] = await db.insert(numberingRules).values({ ...input, tenantId, description: input.description ?? null }).returning();
    return mapRule(requireRow(row, '创建编号规则失败'));
  } catch (error) { rethrowPgUniqueViolation(error, '当前租户已存在相同规则编码'); throw error; }
}

export async function updateNumberingRule(id: number, input: z.output<typeof updateNumberingRuleSchema>) {
  return db.transaction(async tx => {
    const rule = await ensureNumberingRule(id, tx, true);
    requireRuleWrite(rule);
    requireRevision(rule, input.expectedRevision);
    if (input.draft) { requireValidConfig(input.draft, rule.scene); await requireStableSequence(tx, rule, input.draft); }
    if (input.status === 'disabled' && rule.status !== 'disabled') {
      const bindings = await tx.$count(numberingBindings, buildWhere(eq(numberingBindings.ruleId, rule.id), eq(numberingBindings.ownerKey, '*')));
      const allocations = await tx.$count(numberingAllocations, eq(numberingAllocations.ruleId, rule.id));
      if (bindings || allocations) throw new HTTPException(409, { message: rule.scene === 'workflow.instance'
        ? '规则已被流程使用，不能停用；修改编号中心绑定不会改变固定版本，请在流程设计器选择新规则版本后重新发布'
        : '规则已被业务使用，不能停用；请先为业务切换规则' });
      // A preset may be rebound or removed; published snapshots still require their fixed version.
      const definitions = await tx.$count(workflowDefinitions, buildWhere(
        inArray(workflowDefinitions.status, ['published', 'disabled']),
        sql`${workflowDefinitions.flowData} #>> '{settings,numbering,ruleId}' = ${String(rule.id)}`,
      ));
      const drafts = await tx.$count(workflowInstances, buildWhere(
        inArray(workflowInstances.status, ['draft', 'returned']), isNull(workflowInstances.serialNo),
        sql`${workflowInstances.definitionSnapshot} #>> '{flowData,settings,numbering,ruleId}' = ${String(rule.id)}`,
      ));
      if (definitions || drafts) throw new HTTPException(409, { message: '规则仍被流程或待提交申请的固定版本引用，不能停用；请在流程设计器选择新规则版本后重新发布，并先处理待提交申请' });
    }
    const { expectedRevision: _revision, ...values } = input;
    const [row] = await tx.update(numberingRules).set({ ...values, revision: rule.revision + 1 }).where(eq(numberingRules.id, rule.id)).returning();
    return mapRule(requireRow(row, '编号规则不存在'));
  });
}

export async function publishNumberingRule(id: number, input: z.output<typeof publishNumberingRuleSchema>) {
  return db.transaction(async tx => {
    const rule = await ensureNumberingRule(id, tx, true);
    requireRuleWrite(rule);
    requireRevision(rule, input.expectedRevision);
    if (rule.status !== 'enabled') throw new HTTPException(409, { message: '请先启用规则再发布' });
    requireValidConfig(rule.draft, rule.scene);
    await requireStableSequence(tx, rule, rule.draft);
    const version = rule.currentVersion + 1;
    await tx.insert(numberingVersions).values({ ruleId: rule.id, version, config: rule.draft });
    const [row] = await tx.update(numberingRules).set({ currentVersion: version, revision: rule.revision + 1 }).where(eq(numberingRules.id, rule.id)).returning();
    return mapRule(requireRow(row, '编号规则不存在'));
  });
}

export async function removeNumberingRule(id: number) {
  await db.transaction(async tx => {
    const rule = await ensureNumberingRule(id, tx, true);
    requireRuleWrite(rule);
    const versions = await tx.$count(numberingVersions, eq(numberingVersions.ruleId, rule.id));
    const bindings = await tx.$count(numberingBindings, buildWhere(eq(numberingBindings.ruleId, rule.id), eq(numberingBindings.ownerKey, '*')));
    const allocations = await tx.$count(numberingAllocations, eq(numberingAllocations.ruleId, rule.id));
    if (rule.isBuiltin || versions || bindings || allocations) throw new HTTPException(409, { message: '内置、已发布或已使用的编号规则不能删除' });
    await tx.delete(numberingRules).where(eq(numberingRules.id, rule.id));
  });
}

export async function listNumberingVersions(id: number) {
  await ensureNumberingRule(id);
  return (await db.select().from(numberingVersions).where(eq(numberingVersions.ruleId, id)).orderBy(desc(numberingVersions.version))).map(mapVersion);
}

export async function listNumberingCounters(id: number) {
  await ensureNumberingRule(id);
  const tenantId = getTenantScopeId(currentUser());
  const scopeKey = `tenant:${tenantId ?? 0}`;
  const rows = await db.select({ scopeKey: numberingCounters.scopeKey, periodKey: numberingCounters.periodKey, value: numberingCounters.value })
    .from(numberingCounters).where(buildWhere(eq(numberingCounters.ruleId, id), tenantId === undefined ? undefined : or(
      eq(numberingCounters.scopeKey, scopeKey), keywordCondition(`${scopeKey}/`, [numberingCounters.scopeKey], 'like', 'prefix'),
    ))).orderBy(desc(numberingCounters.periodKey), asc(numberingCounters.scopeKey)).limit(200);
  return rows.map(row => ({ ...row, value: row.value.toString() }));
}

export function listNumberingScenes() { return NUMBERING_SCENES.map(scene => ({ ...scene, allowedScopes: [...scene.allowedScopes], parameters: [...scene.parameters] })); }

export function previewNumberingRule(input: z.output<typeof numberingPreviewSchema>) {
  try { return previewBusinessNumbers(input.config, { scene: input.scene, at: input.at ?? new Date(), context: input.context, count: input.count }); }
  catch (error) { throw new HTTPException(400, { message: error instanceof Error ? error.message : '编号预览失败' }); }
}

type DefaultRow = {
  scene: string; tenantId: number | null; ruleId: number; ruleName: string; versionId: number; version: number;
  config: NumberingConfig; sourceTenantName: string | null;
};

function canWriteDefault(scene: ReturnType<typeof getNumberingScene>, tenantId: number | null): boolean {
  const user = currentUser();
  return tenantId === null ? isPlatformAdmin(user) : scene.tenantCustomizable;
}

function mapDefault(scene: ReturnType<typeof getNumberingScene>, tenantId: number | null, rows: readonly DefaultRow[]): NumberingDefault {
  const candidates = rows.filter(row => row.scene === scene.code && (scene.tenantCustomizable || row.tenantId === null));
  const own = candidates.find(row => row.tenantId === tenantId);
  const platform = candidates.find(row => row.tenantId === null);
  const selected = own ?? platform;
  return {
    scene: scene.code, businessName: scene.label, description: scene.description, tenantCustomizable: scene.tenantCustomizable,
    tenantId, sourceTenantId: selected?.tenantId ?? null, sourceTenantName: selected ? selected.tenantId === null ? '平台' : selected.sourceTenantName : null,
    inherited: tenantId !== null && !own && !!platform,
    ruleId: selected?.ruleId ?? null, ruleName: selected?.ruleName ?? null, versionId: selected?.versionId ?? null,
    version: selected?.version ?? null, template: selected?.config.template ?? null, scope: selected?.config.scope ?? null,
    expectedVersionId: own?.versionId ?? null, canUpdate: canWriteDefault(scene, tenantId),
    canReset: tenantId !== null && scene.tenantCustomizable && !!own && !!platform,
  };
}

async function readDefaultRows(executor: DbExecutor, tenantId: number | null, sceneCode?: string): Promise<DefaultRow[]> {
  return executor.select({ scene: numberingBindings.scene, tenantId: numberingBindings.tenantId,
    ruleId: numberingRules.id, ruleName: numberingRules.name, versionId: numberingVersions.id, version: numberingVersions.version,
    config: numberingVersions.config, sourceTenantName: tenants.name,
  }).from(numberingBindings).innerJoin(numberingRules, eq(numberingRules.id, numberingBindings.ruleId))
    .innerJoin(numberingVersions, buildWhere(eq(numberingVersions.id, numberingBindings.versionId), eq(numberingVersions.ruleId, numberingRules.id)))
    .leftJoin(tenants, eq(tenants.id, numberingBindings.tenantId)).where(buildWhere(
      eq(numberingBindings.ownerKey, '*'), inheritedTenantCondition(numberingBindings.tenantId, tenantId),
      sceneCode ? eq(numberingBindings.scene, sceneCode) : undefined,
    ));
}

export async function listNumberingDefaults(): Promise<NumberingDefault[]> {
  const tenantId = getCreateTenantId(currentUser());
  const rows = await readDefaultRows(db, tenantId);
  return NUMBERING_SCENES.map(scene => mapDefault(scene, tenantId, rows));
}

export async function getNumberingDefault(sceneCode: string, executor: DbExecutor = db): Promise<NumberingDefault> {
  const tenantId = getCreateTenantId(currentUser());
  return mapDefault(getNumberingScene(sceneCode), tenantId, await readDefaultRows(executor, tenantId, sceneCode));
}

function requireDefaultWrite(sceneCode: string): number | null {
  const tenantId = getCreateTenantId(currentUser());
  if (!canWriteDefault(getNumberingScene(sceneCode), tenantId)) {
    throw new HTTPException(403, { message: '平台默认和支付编号只能由平台管理员在平台视角配置' });
  }
  return tenantId;
}

async function lockDefaultForWrite(tx: DbTransaction, scene: string, tenantId: number | null, expectedVersionId: number | null) {
  await lockNumberingBinding(tx, { scene, tenantId, ownerKey: '*' });
  const [own] = await tx.select({ id: numberingBindings.id, versionId: numberingBindings.versionId, ruleId: numberingBindings.ruleId })
    .from(numberingBindings).where(buildWhere(eq(numberingBindings.scene, scene), eq(numberingBindings.ownerKey, '*'),
      exactTenantCondition(numberingBindings.tenantId, tenantId))).limit(1);
  if ((own?.versionId ?? null) !== expectedVersionId) throw new HTTPException(409, { message: '默认编号规则已被其他人修改，请刷新后重试' });
  return own;
}

export async function updateNumberingDefault(sceneCode: string, input: z.output<typeof updateNumberingDefaultSchema>): Promise<NumberingDefault> {
  const tenantId = requireDefaultWrite(sceneCode);
  return db.transaction(async tx => {
    await lockDefaultForWrite(tx, sceneCode, tenantId, input.expectedVersionId);
    const rule = await ensureNumberingRule(input.ruleId, tx, true);
    if (rule.scene !== sceneCode || rule.status !== 'enabled' || (rule.tenantId !== null && rule.tenantId !== tenantId)) {
      throw new HTTPException(400, { message: '编号规则与业务类型、租户或启用状态不匹配' });
    }
    const [version] = await tx.select({ id: numberingVersions.id }).from(numberingVersions)
      .where(buildWhere(eq(numberingVersions.id, input.versionId), eq(numberingVersions.ruleId, rule.id))).limit(1);
    const fixedVersion = requireRow(version, '编号版本不存在或不属于所选规则', 400);
    await tx.insert(numberingBindings).values({ scene: sceneCode, ownerKey: '*', tenantId, ruleId: rule.id, versionId: fixedVersion.id, parameterMapping: {} })
      .onConflictDoUpdate({ target: [numberingBindings.scene, numberingBindings.ownerKey, numberingBindings.tenantId],
        set: { ruleId: rule.id, versionId: fixedVersion.id, parameterMapping: {}, updatedAt: new Date() },
      });
    return getNumberingDefault(sceneCode, tx);
  });
}

export async function resetNumberingDefault(sceneCode: string, input: z.output<typeof resetNumberingDefaultSchema>): Promise<NumberingDefault> {
  const tenantId = requireDefaultWrite(sceneCode);
  if (tenantId === null) throw new HTTPException(409, { message: '平台默认编号规则不能删除，请直接选择其他规则版本' });
  return db.transaction(async tx => {
    const own = await lockDefaultForWrite(tx, sceneCode, tenantId, input.expectedVersionId);
    if (!own) throw new HTTPException(409, { message: '当前业务已使用平台默认，无需恢复' });
    const [platform] = await tx.select({ id: numberingBindings.id }).from(numberingBindings).where(buildWhere(
      eq(numberingBindings.scene, sceneCode), eq(numberingBindings.ownerKey, '*'), isNull(numberingBindings.tenantId),
    )).limit(1);
    if (!platform) throw new HTTPException(409, { message: '该业务尚未配置平台默认规则，不能移除租户覆盖' });
    await ensureNumberingRule(own.ruleId, tx, true);
    await tx.delete(numberingBindings).where(buildWhere(eq(numberingBindings.id, own.id), exactTenantCondition(numberingBindings.tenantId, tenantId)));
    return getNumberingDefault(sceneCode, tx);
  });
}

/** References come from actual defaults and frozen workflow JSON, never a mutable owner preset. */
export async function listNumberingRuleUsages(id: number): Promise<NumberingRuleUsage[]> {
  const rule = await ensureNumberingRule(id);
  const ownBindings = tenantScope(numberingBindings);
  const defaults = await db.select({ scene: numberingBindings.scene, tenantId: numberingBindings.tenantId, tenantName: tenants.name,
    versionId: numberingVersions.id, version: numberingVersions.version,
  }).from(numberingBindings).innerJoin(numberingVersions, buildWhere(eq(numberingVersions.id, numberingBindings.versionId), eq(numberingVersions.ruleId, id)))
    .leftJoin(tenants, eq(tenants.id, numberingBindings.tenantId)).where(buildWhere(
      eq(numberingBindings.ruleId, id), eq(numberingBindings.ownerKey, '*'),
      ownBindings ? or(ownBindings, isNull(numberingBindings.tenantId)) : undefined,
    ));
  const versionReference = sql<string>`${workflowDefinitions.flowData} #>> '{settings,numbering,versionId}'`;
  const workflows = rule.scene !== 'workflow.instance' ? [] : await db.select({ id: workflowDefinitions.id, name: workflowDefinitions.name,
    tenantId: workflowDefinitions.tenantId, tenantName: tenants.name, versionId: numberingVersions.id, version: numberingVersions.version,
  }).from(workflowDefinitions).innerJoin(numberingVersions, buildWhere(eq(numberingVersions.ruleId, id), sql`${numberingVersions.id}::text = ${versionReference}`))
    .leftJoin(tenants, eq(tenants.id, workflowDefinitions.tenantId)).where(buildWhere(
      tenantScope(workflowDefinitions), inArray(workflowDefinitions.status, ['published', 'disabled']),
      sql`${workflowDefinitions.flowData} #>> '{settings,numbering,ruleId}' = ${String(id)}`,
    )).orderBy(asc(workflowDefinitions.id));
  return [
    ...defaults.map(row => ({ kind: 'default' as const, scene: getNumberingScene(row.scene).code, businessName: getNumberingScene(row.scene).label,
      name: row.tenantId === null ? '平台默认规则' : '租户默认规则', tenantId: row.tenantId, tenantName: row.tenantId === null ? '平台' : row.tenantName,
      versionId: row.versionId, version: row.version, objectKey: null, destination: null,
    })),
    ...workflows.map(row => ({ kind: 'workflow' as const, scene: 'workflow.instance' as const, businessName: getNumberingScene('workflow.instance').label,
      name: row.name, tenantId: row.tenantId, tenantName: row.tenantId === null ? '平台' : row.tenantName,
      versionId: row.versionId, version: row.version, objectKey: String(row.id), destination: `/workflow/designer/${row.id}`,
    })),
  ];
}

export function listNumberingAllocations(q: QueryOutputOf<typeof numberingAllocationContract.list>) {
  return listRows({ ...q, table: numberingAllocations, where: buildWhere(
    tenantScope(numberingAllocations), q.scene ? eq(numberingAllocations.scene, q.scene) : undefined,
    q.ruleId ? eq(numberingAllocations.ruleId, q.ruleId) : undefined,
    keywordCondition(q.keyword, [numberingAllocations.number, numberingAllocations.businessKey]),
    ...dateRangeConditions(numberingAllocations.createdAt, q.startTime, q.endTime),
  ), orderBy: [desc(numberingAllocations.id)], map: mapAllocation });
}

export const numberingRuleService = { list: listNumberingRules, get: getNumberingRule, create: createNumberingRule, update: updateNumberingRule, remove: removeNumberingRule };
