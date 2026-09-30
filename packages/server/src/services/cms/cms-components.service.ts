import type * as z from 'zod';
import { asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { QueryOutputOf } from '@zenith/shared/core';
import {
  cmsComponentContract, cmsComponentListItemSchema, cmsComponentSchema, cmsComponentVersionSchema,
  diffCmsFieldDefinitions, hasBreakingCmsFieldChanges, normalizeCmsFieldDefinitions,
  type createCmsComponentSchema, type updateCmsComponentSchema,
} from '@zenith/shared/cms';
import { db, readSnapshot } from '../../db';
import { cmsComponents, cmsComponentVersions, type CmsComponentRow } from '../../db/schema/cms-components';
import { cmsModelFields, cmsModels, cmsSites } from '../../db/schema/cms';
import { cmsModelVersions } from '../../db/schema/cms-design';
import type { DbExecutor } from '../../db/types';
import { requireFirstRow } from '../../lib/db-assert';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { pickEntity } from '../../lib/entity-map';
import { buildListResult } from '../../lib/list-query';
import { buildWhere, keywordCondition, withPagination } from '../../lib/where-helpers';
import { isCmsPlatformAdmin } from './cms-access';
import { cmsSnapshotHash } from './cms-design-versions.service';
import { compileCmsFieldDefinitions } from './cms-model-compiler';
import { assertSiteAccess } from './cms-sites.service';

const componentListColumns = {
  id: cmsComponents.id, ownerSiteId: cmsComponents.ownerSiteId, code: cmsComponents.code,
  name: cmsComponents.name, description: cmsComponents.description, status: cmsComponents.status,
  version: cmsComponents.version, publishedVersionId: cmsComponents.publishedVersionId,
  hasUnpublishedChanges: cmsComponents.hasUnpublishedChanges, createdBy: cmsComponents.createdBy,
  updatedBy: cmsComponents.updatedBy, createdAt: cmsComponents.createdAt, updatedAt: cmsComponents.updatedAt,
};
const componentVersionColumns = {
  id: cmsComponentVersions.id, componentId: cmsComponentVersions.componentId, version: cmsComponentVersions.version,
  fields: cmsComponentVersions.fields, componentVersionIds: cmsComponentVersions.componentVersionIds,
  contentHash: cmsComponentVersions.contentHash, createdAt: cmsComponentVersions.createdAt,
};

async function resolveScope(siteId?: number) {
  if (siteId != null) { await assertSiteAccess(siteId); return siteId; }
  if (!isCmsPlatformAdmin()) throw new HTTPException(400, { message: '请选择站点范围' });
  return null;
}
function visible(siteId: number | null): SQL | undefined {
  return siteId == null ? undefined : or(isNull(cmsComponents.ownerSiteId), eq(cmsComponents.ownerSiteId, siteId));
}
async function ensureComponent(id: number, mutable = false, executor: DbExecutor = db): Promise<CmsComponentRow> {
  const row = await requireFirstRow(executor.select().from(cmsComponents).where(eq(cmsComponents.id, id)).limit(1), '内容组件不存在');
  if (row.ownerSiteId != null) await assertSiteAccess(row.ownerSiteId);
  if (mutable && row.ownerSiteId == null && !isCmsPlatformAdmin()) throw new HTTPException(403, { message: '共享组件仅平台管理员可修改' });
  return row;
}
function assertVersion(row: CmsComponentRow, expectedVersion: number) {
  if (row.version !== expectedVersion) throw new HTTPException(409, { message: '内容组件已被其他人修改，请刷新后重试' });
}
async function checkScope(row: CmsComponentRow, siteId?: number) {
  const scope = await resolveScope(siteId);
  if (scope != null && row.ownerSiteId != null && row.ownerSiteId !== scope) throw new HTTPException(404, { message: '内容组件不存在' });
  return scope;
}

export async function getCmsComponent(id: number) {
  const row = await ensureComponent(id);
  const owner = row.ownerSiteId == null ? null : await db.query.cmsSites.findFirst({ where: eq(cmsSites.id, row.ownerSiteId), columns: { name: true } });
  return pickEntity(cmsComponentSchema, row, { ownerSiteName: owner?.name ?? null });
}
export async function listCmsComponents(q: QueryOutputOf<typeof cmsComponentContract.list>) {
  const scope = await resolveScope(q.siteId);
  const where = buildWhere(visible(scope), keywordCondition(q.keyword, [cmsComponents.name, cmsComponents.code]), q.status ? eq(cmsComponents.status, q.status) : undefined);
  return buildListResult({ page: q.page, pageSize: q.pageSize, count: () => db.$count(cmsComponents, where), rows: async () => {
    const rows = await withPagination(db.select({ ...componentListColumns, ownerSiteName: cmsSites.name }).from(cmsComponents)
      .leftJoin(cmsSites, eq(cmsSites.id, cmsComponents.ownerSiteId)).where(where).orderBy(asc(cmsComponents.name), asc(cmsComponents.id)).$dynamic(), q.page, q.pageSize);
    return rows.map(row => pickEntity(cmsComponentListItemSchema, row));
  } });
}
export async function allCmsComponents(siteId?: number) {
  const scope = await resolveScope(siteId);
  const rows = await db.select({ ...componentListColumns, ownerSiteName: cmsSites.name, fields: cmsComponentVersions.fields }).from(cmsComponents)
    .innerJoin(cmsComponentVersions, eq(cmsComponentVersions.id, cmsComponents.publishedVersionId))
    .leftJoin(cmsSites, eq(cmsSites.id, cmsComponents.ownerSiteId))
    .where(buildWhere(visible(scope), eq(cmsComponents.status, 'enabled'), isNotNull(cmsComponents.publishedVersionId))).orderBy(asc(cmsComponents.name), asc(cmsComponents.id));
  return rows.map(row => pickEntity(cmsComponentSchema, row));
}
export async function createCmsComponent(data: z.output<typeof createCmsComponentSchema>) {
  if (data.ownerSiteId != null) await assertSiteAccess(data.ownerSiteId);
  else if (!isCmsPlatformAdmin()) throw new HTTPException(403, { message: '共享组件仅平台管理员可创建' });
  try {
    const created = await db.transaction(async tx => {
      const { fields } = await compileCmsFieldDefinitions(tx, normalizeCmsFieldDefinitions(data.fields), { ownerSiteId: data.ownerSiteId ?? null });
      return requireFirstRow(tx.insert(cmsComponents).values({ ...data, fields }).returning(), '创建内容组件失败');
    });
    return getCmsComponent(created.id);
  } catch (error) { rethrowPgUniqueViolation(error, '组件编码已存在'); }
}
export async function updateCmsComponent(id: number, data: z.output<typeof updateCmsComponentSchema>) {
  await ensureComponent(id, true);
  if (Object.prototype.hasOwnProperty.call(data, 'ownerSiteId')) throw new HTTPException(400, { message: '组件归属站点创建后不可变更' });
  try {
    await db.transaction(async tx => {
      const current = await requireFirstRow(tx.select().from(cmsComponents).where(eq(cmsComponents.id, id)).for('update').limit(1), '内容组件不存在');
      assertVersion(current, data.expectedVersion);
      const { expectedVersion: _expectedVersion, ...patch } = data;
      const fields = patch.fields ? (await compileCmsFieldDefinitions(tx, normalizeCmsFieldDefinitions(patch.fields, current.fields), { ownerSiteId: current.ownerSiteId, componentId: id })).fields : current.fields;
      const changedFields = cmsSnapshotHash(fields) !== cmsSnapshotHash(current.fields);
      const changed = changedFields || Object.entries(patch).some(([key, value]) => key !== 'fields' && value !== current[key as keyof CmsComponentRow]);
      if (!changed) return;
      await tx.update(cmsComponents).set({ ...patch, fields, version: current.version + 1,
        hasUnpublishedChanges: current.hasUnpublishedChanges || changedFields }).where(eq(cmsComponents.id, id));
    });
    return getCmsComponent(id);
  } catch (error) { rethrowPgUniqueViolation(error, '组件编码已存在'); }
}
export async function publishCmsComponent(id: number, expectedVersion: number, siteId?: number) {
  const current = await ensureComponent(id, true); await checkScope(current, siteId);
  await db.transaction(async tx => {
    const row = await requireFirstRow(tx.select().from(cmsComponents).where(eq(cmsComponents.id, id)).for('update').limit(1), '内容组件不存在');
    assertVersion(row, expectedVersion);
    if (row.status !== 'enabled') throw new HTTPException(400, { message: '请先启用组件' });
    if (!row.fields.length) throw new HTTPException(400, { message: '组件至少需要一个字段' });
    const compiled = await compileCmsFieldDefinitions(tx, row.fields, { ownerSiteId: row.ownerSiteId, componentId: id });
    const contentHash = cmsSnapshotHash(compiled.fields);
    const [previous] = await tx.select(componentVersionColumns).from(cmsComponentVersions).where(eq(cmsComponentVersions.componentId, id)).orderBy(desc(cmsComponentVersions.version)).limit(1);
    if (previous?.contentHash === contentHash) {
      if (row.hasUnpublishedChanges) await tx.update(cmsComponents).set({ hasUnpublishedChanges: false }).where(eq(cmsComponents.id, id));
      return;
    }
    const version = await requireFirstRow(tx.insert(cmsComponentVersions).values({ componentId: id, version: (previous?.version ?? 0) + 1, ...compiled, contentHash }).returning(), '发布组件失败');
    await tx.update(cmsComponents).set({ publishedVersionId: version.id, hasUnpublishedChanges: false, version: row.version + 1 }).where(eq(cmsComponents.id, id));
  });
  return getCmsComponent(id);
}
export async function listCmsComponentVersions(id: number, siteId?: number) {
  await checkScope(await ensureComponent(id), siteId);
  const rows = await db.select(componentVersionColumns).from(cmsComponentVersions).where(eq(cmsComponentVersions.componentId, id)).orderBy(desc(cmsComponentVersions.version));
  return rows.map(row => pickEntity(cmsComponentVersionSchema, row));
}
export async function deleteCmsComponent(id: number) {
  await ensureComponent(id, true);
  await db.transaction(async tx => {
    await requireFirstRow(tx.select({ id: cmsComponents.id }).from(cmsComponents).where(eq(cmsComponents.id, id)).for('update').limit(1), '内容组件不存在');
    if (await tx.$count(cmsComponentVersions, eq(cmsComponentVersions.componentId, id))) throw new HTTPException(409, { message: '已发布组件保留历史版本，请停用组件' });
    await tx.delete(cmsComponents).where(eq(cmsComponents.id, id));
  });
}

export async function getCmsComponentImpact(id: number, siteId?: number) {
  const current = await ensureComponent(id); const scope = await checkScope(current, siteId);
  return readSnapshot(async tx => {
    const row = await requireFirstRow(tx.select().from(cmsComponents).where(eq(cmsComponents.id, id)).limit(1), '内容组件不存在');
    const compiled = await compileCmsFieldDefinitions(tx, row.fields, { ownerSiteId: row.ownerSiteId, componentId: id });
    const [previous] = row.publishedVersionId ? await tx.select(componentVersionColumns).from(cmsComponentVersions).where(eq(cmsComponentVersions.id, row.publishedVersionId)).limit(1) : [];
    const changes = diffCmsFieldDefinitions(previous?.fields ?? [], compiled.fields);
    const versions = await tx.select({ id: cmsComponentVersions.id }).from(cmsComponentVersions).where(eq(cmsComponentVersions.componentId, id));
    const ids = versions.map(version => version.id);
    const breaking = hasBreakingCmsFieldChanges(previous?.fields ?? [], compiled.fields);
    if (!ids.length) return { componentId: id, publishedVersionId: row.publishedVersionId, changes, breaking, models: [] };
    const references = (value: SQL) => sql<boolean>`exists (select 1 from jsonb_path_query(${value}, '$.**.componentVersionId') as component_reference(value) where (component_reference.value #>> '{}')::integer in (${sql.join(ids.map(versionId => sql`${versionId}`), sql`, `)}))`;
    const modelScope = scope == null ? undefined : or(isNull(cmsModels.ownerSiteId), eq(cmsModels.ownerSiteId, scope));
    const drafts = await tx.selectDistinct({ id: cmsModels.id, name: cmsModels.name, ownerSiteId: cmsModels.ownerSiteId }).from(cmsModels)
      .innerJoin(cmsModelFields, eq(cmsModelFields.modelId, cmsModels.id)).where(buildWhere(modelScope, references(sql`${cmsModelFields.configuration}`)));
    const published = await tx.select({ id: cmsModels.id, name: cmsModels.name, ownerSiteId: cmsModels.ownerSiteId }).from(cmsModels)
      .innerJoin(cmsModelVersions, eq(cmsModelVersions.id, cmsModels.publishedVersionId)).where(buildWhere(modelScope, references(sql`${cmsModelVersions.fields}`)));
    const modelMap = new Map(drafts.map(model => [model.id, { ...model, workingCopy: true, publishedVersion: false }]));
    for (const model of published) modelMap.set(model.id, { ...model, workingCopy: modelMap.has(model.id), publishedVersion: true });
    return { componentId: id, publishedVersionId: row.publishedVersionId, changes, breaking, models: [...modelMap.values()].sort((a, b) => a.id - b.id) };
  });
}
