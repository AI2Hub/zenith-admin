import { asc, desc, eq, isNull, or } from 'drizzle-orm';
import type * as z from 'zod';
import { HTTPException } from 'hono/http-exception';
import type { QueryOutputOf } from '@zenith/shared/core';
import {
  NUMBERING_SCENES, NUMBERING_SYSTEM_PARAMETERS, getNumberingScene, numberingAllocationContract,
  numberingAllocationSchema, numberingBindingContract, numberingBindingSchema, numberingRuleContract,
  numberingRuleSchema, numberingVersionSchema, parseNumberingTemplate, previewBusinessNumbers,
  validateNumberingConfig, validateNumberingParameterMapping,
} from '@zenith/shared/platform';
import type {
  createNumberingRuleSchema, updateNumberingRuleSchema, publishNumberingRuleSchema,
  upsertNumberingBindingSchema, numberingPreviewSchema, NumberingConfig,
} from '@zenith/shared/platform';
import { db } from '../../db';
import type { DbExecutor, DbTransaction } from '../../db/types';
import { numberingAllocations, numberingBindings, numberingCounters, numberingRules, numberingVersions, workflowDefinitions } from '../../db/schema';
import type { NumberingAllocationRow, NumberingBindingRow, NumberingRuleRow } from '../../db/schema/numbering';
import { currentUser } from '../../lib/context';
import { requireRow } from '../../lib/db-assert';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { entityMapper } from '../../lib/entity-map';
import { buildListResult, listRows } from '../../lib/list-query';
import { getCreateTenantId, getTenantScopeId, isPlatformAdmin, tenantScope, exactTenantCondition } from '../../lib/tenant';
import { buildWhere, dateRangeConditions, keywordCondition } from '../../lib/where-helpers';
import { pageOffset } from '../../lib/pagination';
import { numberingSequencePolicy } from './numbering-runtime';
import { lockNumberingBinding } from './numbering-binding-lock';

const mapRule = entityMapper(numberingRuleSchema, (row: NumberingRuleRow) => ({ scene: getNumberingScene(row.scene).code }));
const mapVersion = entityMapper(numberingVersionSchema);
const mapBinding = entityMapper(numberingBindingSchema, (row: NumberingBindingRow & { ruleName: string; version: number }) => ({ scene: getNumberingScene(row.scene).code }));
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
    currentVersion: numberingRules.currentVersion, versionId: numberingVersions.id,
  }).from(numberingRules).innerJoin(numberingVersions, buildWhere(
    eq(numberingVersions.ruleId, numberingRules.id), eq(numberingVersions.version, numberingRules.currentVersion),
  )).where(buildWhere(readableRuleScope(), eq(numberingRules.status, 'enabled'), q.scene ? eq(numberingRules.scene, q.scene) : undefined)).orderBy(asc(numberingRules.name));
  return rows.map(row => ({ ...row, scene: getNumberingScene(row.scene).code }));
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
      const bindings = await tx.$count(numberingBindings, eq(numberingBindings.ruleId, rule.id));
      const allocations = await tx.$count(numberingAllocations, eq(numberingAllocations.ruleId, rule.id));
      if (bindings || allocations) throw new HTTPException(409, { message: '规则已被业务使用，不能停用；请先为业务切换规则' });
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
    const bindings = await tx.$count(numberingBindings, eq(numberingBindings.ruleId, rule.id));
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

export function listNumberingBindings(q: QueryOutputOf<typeof numberingBindingContract.list>) {
  const own = tenantScope(numberingBindings);
  const where = buildWhere(
    own ? or(own, isNull(numberingBindings.tenantId)) : undefined,
    q.scene ? eq(numberingBindings.scene, q.scene) : undefined, q.ruleId ? eq(numberingBindings.ruleId, q.ruleId) : undefined,
    keywordCondition(q.ownerKey, [numberingBindings.ownerKey]),
  );
  return buildListResult({
    ...q,
    count: () => db.$count(numberingBindings, where),
    rows: () => db.query.numberingBindings.findMany({
      where, orderBy: [asc(numberingBindings.scene), asc(numberingBindings.ownerKey)],
      limit: q.pageSize, offset: pageOffset(q.page, q.pageSize),
      with: { rule: { columns: { name: true } }, version: { columns: { version: true } } },
    }),
    map: row => mapBinding({ ...row, ruleName: row.rule.name, version: row.version.version }),
  });
}

async function ensureBindingOwner(tx: DbTransaction, scene: string, ownerKey: string, tenantId: number | null) {
  if (ownerKey === '*') return;
  if (scene !== 'workflow.instance' || !/^[1-9]\d*$/.test(ownerKey) || !Number.isSafeInteger(Number(ownerKey))) {
    throw new HTTPException(400, { message: '业务对象标识仅允许 * 或流程定义 ID' });
  }
  const [definition] = await tx.select({ id: workflowDefinitions.id }).from(workflowDefinitions).where(buildWhere(
    eq(workflowDefinitions.id, Number(ownerKey)), exactTenantCondition(workflowDefinitions.tenantId, tenantId), tenantScope(workflowDefinitions),
  )).limit(1);
  requireRow(definition, '流程定义不存在或不属于当前租户');
}

export async function upsertNumberingBinding(input: z.output<typeof upsertNumberingBindingSchema>) {
  const user = currentUser();
  const tenantId = getCreateTenantId(user);
  const scene = getNumberingScene(input.scene);
  if (tenantId === null && input.ownerKey === '*' && !isPlatformAdmin(user)) throw new HTTPException(403, { message: '平台默认编号绑定只能由平台管理员维护' });
  if (!scene.tenantCustomizable && (!isPlatformAdmin(user) || tenantId !== null)) throw new HTTPException(403, { message: '支付编号绑定只能由平台管理员在平台视角维护' });
  const mappingErrors = validateNumberingParameterMapping(input.scene, input.parameterMapping);
  if (mappingErrors.length) throw new HTTPException(400, { message: mappingErrors.join('；') });
  return db.transaction(async tx => {
    await lockNumberingBinding(tx, { tenantId, scene: input.scene, ownerKey: input.ownerKey });
    if (tenantId === null && !isPlatformAdmin(user)) {
      const [existing] = await tx.select().from(numberingBindings).where(buildWhere(
        eq(numberingBindings.scene, input.scene), eq(numberingBindings.ownerKey, input.ownerKey), exactTenantCondition(numberingBindings.tenantId, tenantId),
      )).limit(1);
      if (existing) requireRuleWrite(await ensureNumberingRule(existing.ruleId, tx));
    }
    const rule = await ensureNumberingRule(input.ruleId, tx, true);
    if (tenantId === null && rule.isBuiltin && !isPlatformAdmin(user)) throw new HTTPException(403, { message: '平台内置业务绑定只能由平台管理员维护' });
    if (rule.scene !== input.scene || rule.status !== 'enabled' || (rule.tenantId !== null && rule.tenantId !== tenantId)) throw new HTTPException(400, { message: '编号规则与业务、租户或启用状态不匹配' });
    const [version] = await tx.select().from(numberingVersions).where(buildWhere(eq(numberingVersions.id, input.versionId), eq(numberingVersions.ruleId, rule.id))).limit(1);
    requireRow(version, '编号版本不存在或不属于所选规则', 400);
    await ensureBindingOwner(tx, input.scene, input.ownerKey, tenantId);
    const mappedParameters = parseNumberingTemplate(version!.config.template).filter(segment => segment.kind === 'parameter' && !(NUMBERING_SYSTEM_PARAMETERS as readonly string[]).includes(segment.value));
    for (const segment of input.scene === 'workflow.instance' ? mappedParameters : []) {
      if (segment.kind === 'parameter' && !input.parameterMapping[segment.value]) throw new HTTPException(400, { message: `请配置业务参数 ${segment.value} 的字段映射` });
    }
    const [row] = await tx.insert(numberingBindings).values({ ...input, tenantId }).onConflictDoUpdate({
      target: [numberingBindings.scene, numberingBindings.ownerKey, numberingBindings.tenantId],
      set: { ruleId: rule.id, versionId: input.versionId, parameterMapping: input.parameterMapping, updatedAt: new Date() },
    }).returning();
    return mapBinding({ ...requireRow(row, '保存业务绑定失败'), ruleName: rule.name, version: version!.version });
  });
}

export async function getNumberingBinding(id: number) {
  const own = tenantScope(numberingBindings);
  const row = requireRow(await db.query.numberingBindings.findFirst({
    where: buildWhere(eq(numberingBindings.id, id), own ? or(own, isNull(numberingBindings.tenantId)) : undefined),
    with: { rule: { columns: { name: true } }, version: { columns: { version: true } } },
  }), '编号业务绑定不存在');
  return mapBinding({ ...row, ruleName: row.rule.name, version: row.version.version });
}

export async function removeNumberingBinding(id: number) {
  await db.transaction(async tx => {
    const [binding] = await tx.select().from(numberingBindings).where(buildWhere(eq(numberingBindings.id, id), tenantScope(numberingBindings))).limit(1);
    const initial = requireRow(binding, '编号业务绑定不存在');
    await lockNumberingBinding(tx, initial);
    // 等待锁期间可能发生改绑，权限只能依据锁内重新读取的目标。
    const [locked] = await tx.select().from(numberingBindings).where(buildWhere(eq(numberingBindings.id, id), tenantScope(numberingBindings))).limit(1);
    const row = requireRow(locked, '编号业务绑定已变化，请刷新后重试', 409);
    if (row.tenantId === null && row.ownerKey === '*') throw new HTTPException(409, { message: '平台默认编号绑定不能删除，请直接切换规则' });
    const user = currentUser();
    if ((!isPlatformAdmin(user) && row.tenantId !== getCreateTenantId(user)) || (!getNumberingScene(row.scene).tenantCustomizable && !isPlatformAdmin(user))) throw new HTTPException(403, { message: '无权移除此业务绑定' });
    const rule = await ensureNumberingRule(row.ruleId, tx, true);
    if (row.tenantId === null && rule.isBuiltin && !isPlatformAdmin(user)) throw new HTTPException(403, { message: '平台内置业务绑定只能由平台管理员维护' });
    await tx.delete(numberingBindings).where(buildWhere(eq(numberingBindings.id, row.id), tenantScope(numberingBindings)));
  });
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
