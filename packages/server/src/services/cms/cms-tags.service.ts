import { HTTPException } from 'hono/http-exception';
import { assertCmsTermPlacement } from './cms-vocabularies.service';
import { lockCmsSiteForMutation } from './cms-site-publish-lock.service';
import { requireRow } from '../../lib/db-assert';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { createCmsTagSchema, updateCmsTagSchema, type CreateCmsTagInput, type UpdateCmsTagInput } from '@zenith/shared/cms';
import { cmsContentWorkingCopies, cmsContentTags } from '../../db/schema';
import { sql } from 'drizzle-orm';
import { requireFirstRow } from '../../lib/db-assert';
import { listRows } from '../../lib/list-query';
import type { QueryOutputOf } from '@zenith/shared/core';
import { eq, asc, and } from 'drizzle-orm';
import { cmsTagContract, cmsTagSchema } from '@zenith/shared/cms';
import { db } from '../../db';
import { cmsTags } from '../../db/schema';
import type { CmsTagRow } from '../../db/schema';
import { buildWhere, keywordCondition } from '../../lib/where-helpers';
import { assertSiteAccess, ensureCmsSiteExists } from './cms-sites.service';
import { refreshCmsPublicConfiguration } from './cms-public-config-refresh.service';
import { defineCrudService } from '../../lib/crud-service';
import { entityMapper } from '../../lib/entity-map';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────
export const mapCmsTag = entityMapper(cmsTagSchema);

// ─── 前置校验 ─────────────────────────────────────────────────────────────────
export async function ensureCmsTagExists(id: number): Promise<CmsTagRow> {
  return requireFirstRow(db.select().from(cmsTags).where(eq(cmsTags.id, id)).limit(1), '标签不存在');
}

export async function getCmsTag(id: number) {
  const row = await ensureCmsTagExists(id);
  await assertSiteAccess(row.siteId);
  return mapCmsTag(row);
}

// ─── 列表 ─────────────────────────────────────────────────────────────────────
export async function listCmsTags(q: QueryOutputOf<typeof cmsTagContract.list>) {
  await ensureCmsSiteExists(q.siteId);
  await assertSiteAccess(q.siteId);
  const where = buildWhere(
    eq(cmsTags.siteId, q.siteId),
    keywordCondition(q.keyword, [cmsTags.name, cmsTags.slug]),
    keywordCondition(q.groupName, [cmsTags.groupName]),
    q.vocabularyId ? eq(cmsTags.vocabularyId, q.vocabularyId) : undefined,
  );
  return listRows({
    page: q.page,
    pageSize: q.pageSize,
    table: cmsTags,
    where,
    orderBy: [asc(cmsTags.id)],
    map: mapCmsTag,
  });
}

/** 站点全部标签（内容编辑打标下拉用） */
export async function listAllCmsTags(siteId: number) {
  await ensureCmsSiteExists(siteId);
  await assertSiteAccess(siteId);
  const rows = await db.select().from(cmsTags).where(and(
    eq(cmsTags.siteId, siteId),
  )).orderBy(asc(cmsTags.id));
  return rows.map(mapCmsTag);
}

// ─── 创建 / 更新 / 删除 ────────────────────────────────────────────────────────
export const cmsTagService = defineCrudService(cmsTagContract, {
  table: cmsTags,
  map: mapCmsTag,
  notFound: '标签不存在',
  unique: '同站点下标签名称或标识已存在',
  list: (q) => ({
    where: [
      eq(cmsTags.siteId, q.siteId),
      keywordCondition(q.keyword, [cmsTags.name, cmsTags.slug]),
      keywordCondition(q.groupName, [cmsTags.groupName]),
    q.vocabularyId ? eq(cmsTags.vocabularyId, q.vocabularyId) : undefined,
    ],
    orderBy: [asc(cmsTags.id)],
  }),
  create: {
    before: async (data) => {
      await ensureCmsSiteExists(data.siteId);
      await assertSiteAccess(data.siteId);
    },
    after: async (_entity, row) => refreshCmsPublicConfiguration(row.siteId, '标签创建', `tag:${row.id}:${row.updatedAt.getTime()}`),
  },
  update: {
    before: async (_data, current) => {
      await assertSiteAccess(current.siteId);
    },
    after: async (_entity, row) => refreshCmsPublicConfiguration(row.siteId, '标签更新', `tag:${row.id}:${row.updatedAt.getTime()}`),
  },
  remove: {
    before: async (current) => {
      await assertSiteAccess(current.siteId);
    },
    after: async (current) => refreshCmsPublicConfiguration(current.siteId, '标签删除', `tag:${current.id}:deleted:${Date.now()}`),
  },
});

export async function createCmsTag(input: CreateCmsTagInput) {
  const data = createCmsTagSchema.parse(input);
  await ensureCmsSiteExists(data.siteId); await assertSiteAccess(data.siteId);
  const row = await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, data.siteId);
    await assertCmsTermPlacement(tx, data.siteId, data);
    try { return requireRow((await tx.insert(cmsTags).values(data).returning())[0], '词条创建失败'); }
    catch (error) { rethrowPgUniqueViolation(error, '同站点下名称或标识已存在'); throw error; }
  });
  await refreshCmsPublicConfiguration(row.siteId, '创建标签或分类词条', `tag:${row.id}`);
  return mapCmsTag(row);
}
export async function updateCmsTag(id: number, input: UpdateCmsTagInput) {
  const data = updateCmsTagSchema.parse(input);
  const current = await ensureCmsTagExists(id); await assertSiteAccess(current.siteId);
  const row = await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, current.siteId);
    const locked = requireRow((await tx.select().from(cmsTags).where(eq(cmsTags.id, id)).for('update'))[0], '词条不存在');
    await assertCmsTermPlacement(tx, current.siteId, { ...locked, ...data }, id);
    if (data.vocabularyId !== undefined && data.vocabularyId !== locked.vocabularyId && await tx.$count(cmsTags, eq(cmsTags.parentId, id))) throw new HTTPException(409, { message: '包含子词条，不能直接切换词表' });
    try { return requireRow((await tx.update(cmsTags).set(data).where(eq(cmsTags.id, id)).returning())[0], '词条不存在'); }
    catch (error) { rethrowPgUniqueViolation(error, '同站点下名称或标识已存在'); throw error; }
  });
  await refreshCmsPublicConfiguration(row.siteId, '更新标签或分类词条', `tag:${row.id}`);
  return mapCmsTag(row);
}
export async function deleteCmsTag(id: number) {
  const current = await ensureCmsTagExists(id); await assertSiteAccess(current.siteId);
  await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, current.siteId);
    if (await tx.$count(cmsTags, eq(cmsTags.parentId, id))) throw new HTTPException(409, { message: '请先处理子词条' });
    if (await tx.$count(cmsContentTags, eq(cmsContentTags.tagId, id))) throw new HTTPException(409, { message: '标签或词条仍被已发布内容使用' });
    if (await tx.$count(cmsContentWorkingCopies, sql`${cmsContentWorkingCopies.snapshot}->'tagIds' @> ${JSON.stringify([id])}::jsonb`)) throw new HTTPException(409, { message: '标签或词条仍被工作稿使用，请先调整内容分类' });
    await tx.delete(cmsTags).where(eq(cmsTags.id, id));
  });
  await refreshCmsPublicConfiguration(current.siteId, '删除标签或分类词条', `tag:${id}`);
}
