import { and, asc, desc, eq, gt, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cmsContentCollectionSchema, cmsCollectionDefinitionSchema, validateCmsCollectionFieldRules, type cmsContentCollectionContract, type CmsCollectionDefinition } from '@zenith/shared/cms';
import type { BodyOf, QueryOutputOf } from '@zenith/shared/core';
import { db, withDbExecutor } from '../../db';
import { cmsContentCollections, cmsContentCollectionVersions } from '../../db/schema/cms-content-collections';
import { cmsChannels, cmsContents, cmsContentTags, cmsModelVersions, cmsModels, cmsPages, cmsSites, cmsTags } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { requireRow } from '../../lib/db-assert';
import { pickEntity } from '../../lib/entity-map';
import { buildWhere, keywordCondition, withPagination } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { rethrowPgUniqueViolation } from '../../lib/db-errors';
import { assertSiteAccess, ensureCmsSiteExists } from './cms-sites.service';
import { getAccessibleChannelIds, assertChannelsAccess } from './cms-channels.service';
import { getEffectivelyEnabledCmsChannelIds } from './cms-channel-visibility.service';
import { cmsContentDataScope, requireCmsContentsAccess } from './cms-content-access.service';
import { lockCmsSiteForMutation } from './cms-site-publish-lock.service';
import { captureCmsConfiguration } from './cms-configuration-snapshot.service';
import { stageCmsConfigurationDraft } from './cms-configuration-drafts.service';
import { cmsContentListColumns } from './cms-content-columns';
import { resolveCmsContentRows } from './cms-resource-refs.service';
import { cmsGenerationContext, cmsGenerationNow } from './cms-generation-context';
import { hasCmsGenerationTable, withCmsPublicGeneration } from './cms-generation-storage.service';
import { buildCmsContentUrls } from './cms-urls';
import { formatDateTime } from '../../lib/datetime';

const map = (row: typeof cmsContentCollections.$inferSelect) => pickEntity(cmsContentCollectionSchema, row);
async function requireCollection(id: number) {
  const row = requireRow((await db.select().from(cmsContentCollections).where(eq(cmsContentCollections.id, id)).limit(1))[0], '内容集合不存在');
  await assertSiteAccess(row.siteId); return row;
}
async function validateDefinition(siteId: number, definition: CmsCollectionDefinition, executor: DbExecutor = db, checkAccess = true) {
  if (checkAccess) await assertChannelsAccess(definition.channelIds);
  const channels = definition.channelIds.length ? await executor.$count(cmsChannels, and(eq(cmsChannels.siteId, siteId), inArray(cmsChannels.id, definition.channelIds))) : 0;
  if (channels !== new Set(definition.channelIds).size) throw new HTTPException(400, { message: '栏目不属于本站' });
  if (definition.tagIds.length && await executor.$count(cmsTags, and(eq(cmsTags.siteId, siteId), inArray(cmsTags.id, definition.tagIds))) !== new Set(definition.tagIds).size) throw new HTTPException(400, { message: '分类词条不属于本站' });
  const explicitIds = [...definition.pinnedIds, ...definition.excludedIds];
  if (explicitIds.length) {
    if (checkAccess) await requireCmsContentsAccess(explicitIds);
    if (await executor.$count(cmsContents, and(eq(cmsContents.siteId, siteId), inArray(cmsContents.id, explicitIds))) !== new Set(explicitIds).size) throw new HTTPException(400, { message: '集合内容不属于本站' });
  }
  if (definition.modelId) {
    const model = requireRow((await executor.select({ ownerSiteId: cmsModels.ownerSiteId, versionId: cmsModels.publishedVersionId }).from(cmsModels).where(eq(cmsModels.id, definition.modelId)).limit(1))[0], '模型不存在');
    if (model.ownerSiteId != null && model.ownerSiteId !== siteId) throw new HTTPException(400, { message: '模型不属于本站' });
    const versionId = definition.modelVersionId ?? model.versionId;
    if (!versionId) throw new HTTPException(400, { message: '请先发布集合使用的内容模型' });
    const version = requireRow((await executor.select({ fields: cmsModelVersions.fields }).from(cmsModelVersions).where(and(eq(cmsModelVersions.id, versionId), eq(cmsModelVersions.modelId, definition.modelId))).limit(1))[0], '固定模型版本不存在或不属于所选模型');
    definition.modelVersionId = versionId;
    const ruleIssues = validateCmsCollectionFieldRules(definition, version.fields);
    if (ruleIssues.length) throw new HTTPException(400, { message: ruleIssues.join('；') });
  }
  else definition.modelVersionId = null;
}
async function stage(executor: Parameters<typeof stageCmsConfigurationDraft>[0], siteId: number) {
  await stageCmsConfigurationDraft(executor, siteId, await captureCmsConfiguration(executor, siteId, { configurationTables: ['cms_content_collections'] }));
}
export async function listCmsContentCollections(q: QueryOutputOf<typeof cmsContentCollectionContract.list>) {
  await assertSiteAccess(q.siteId);
  const where = buildWhere(eq(cmsContentCollections.siteId, q.siteId), keywordCondition(q.keyword, [cmsContentCollections.name, cmsContentCollections.code]));
  return buildListResult({ page: q.page, pageSize: q.pageSize, count: () => db.$count(cmsContentCollections, where), rows: () => withPagination(db.select().from(cmsContentCollections).where(where).orderBy(desc(cmsContentCollections.id)).$dynamic(), q.page, q.pageSize), map });
}
export async function allCmsContentCollections(siteId: number) {
  await assertSiteAccess(siteId);
  return (await db.select().from(cmsContentCollections).where(eq(cmsContentCollections.siteId, siteId)).orderBy(asc(cmsContentCollections.name))).map(map);
}
export async function getCmsContentCollection(id: number) { return map(await requireCollection(id)); }
export async function saveCmsContentCollection(id: number | undefined, input: BodyOf<typeof cmsContentCollectionContract.create> | BodyOf<typeof cmsContentCollectionContract.update>) {
  const current = id ? await requireCollection(id) : null;
  const siteId = current?.siteId ?? (input as BodyOf<typeof cmsContentCollectionContract.create>).siteId;
  await ensureCmsSiteExists(siteId); await assertSiteAccess(siteId);
  const definition = cmsCollectionDefinitionSchema.parse(input.definition ?? current?.definition);
  await validateDefinition(siteId, definition);
  const saved = await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, siteId);
    await validateDefinition(siteId, definition, tx, false);
    try {
      let row: typeof cmsContentCollections.$inferSelect;
      if (current) {
        const [locked] = await tx.select({ version: cmsContentCollections.version }).from(cmsContentCollections).where(eq(cmsContentCollections.id, current.id)).for('update');
        if (locked?.version !== (input as BodyOf<typeof cmsContentCollectionContract.update>).expectedVersion) throw new HTTPException(409, { message: '集合已被修改，请重新加载' });
        row = requireRow((await tx.update(cmsContentCollections).set({ name: input.name, code: input.code, description: input.description, definition, version: locked.version + 1 }).where(eq(cmsContentCollections.id, current.id)).returning())[0], '集合不存在');
      } else row = requireRow((await tx.insert(cmsContentCollections).values({ ...input as BodyOf<typeof cmsContentCollectionContract.create>, definition }).returning())[0], '创建集合失败');
      await tx.insert(cmsContentCollectionVersions).values({ collectionId: row.id, siteId, name: row.name, version: row.version, definition });
      await stage(tx, siteId); return row;
    } catch (error) { rethrowPgUniqueViolation(error, '集合编码已存在'); throw error; }
  }); return map(saved);
}
export async function removeCmsContentCollection(id: number) {
  const row = await requireCollection(id);
  await db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, row.siteId);
    const inPages = await tx.$count(cmsPages, and(eq(cmsPages.siteId, row.siteId), sql`${cmsPages.blocks} @> ${JSON.stringify([{ props: { collectionId: id } }])}::jsonb`));
    const inSite = await tx.$count(cmsSites, and(eq(cmsSites.id, row.siteId), sql`${cmsSites.settings}->'themeConfig'->'homeSections' @> ${JSON.stringify([{ collectionId: id }])}::jsonb`));
    if (inPages || inSite) throw new HTTPException(409, { message: '集合仍被页面或首页引用，请先解除引用' });
    await tx.delete(cmsContentCollections).where(eq(cmsContentCollections.id, id)); await stage(tx, row.siteId);
  });
}
export async function cmsCollectionVersions(id: number) {
  await requireCollection(id);
  const rows = await db.select({ version: cmsContentCollectionVersions.version, name: cmsContentCollectionVersions.name, definition: cmsContentCollectionVersions.definition, createdAt: cmsContentCollectionVersions.createdAt }).from(cmsContentCollectionVersions).where(eq(cmsContentCollectionVersions.collectionId, id)).orderBy(desc(cmsContentCollectionVersions.version));
  return rows.map(row => ({ ...row, createdAt: formatDateTime(row.createdAt) }));
}

/** Called inside the same generation as its consumer; no later working content is read. */
export async function resolveCmsCollection(siteId: number, id: number, options: { definition?: CmsCollectionDefinition; allowedChannelIds?: number[] | null; contentScope?: SQL; limit?: number } = {}, executor: DbExecutor = db) {
  const generation = cmsGenerationContext();
  if (!generation || generation.siteId !== siteId) return [];
  if (!options.definition && !await hasCmsGenerationTable(executor, generation.generationId, 'cms_content_collections')) return [];
  const collection = options.definition ? null : (await executor.select({ definition: cmsContentCollections.definition }).from(cmsContentCollections).where(and(eq(cmsContentCollections.siteId, siteId), eq(cmsContentCollections.id, id))).limit(1))[0];
  const definition = options.definition ?? requireRow(collection, '当前公开版本没有此内容集合').definition;
  const enabled = [...await getEffectivelyEnabledCmsChannelIds(siteId, executor)].filter(channelId => options.allowedChannelIds == null || options.allowedChannelIds.includes(channelId));
  if (!enabled.length) return [];
  const base = buildWhere(eq(cmsContents.siteId, siteId), eq(cmsContents.status, 'published'), isNull(cmsContents.deletedAt), isNull(cmsContents.archivedAt), inArray(cmsContents.channelId, enabled), or(isNull(cmsContents.expireAt), gt(cmsContents.expireAt, cmsGenerationNow())), definition.excludedIds.length ? notInArray(cmsContents.id, definition.excludedIds) : undefined, options.contentScope);
  // Immutable versions may be newer than the online generation when previewing a working collection.
  const [modelVersion] = definition.modelVersionId ? await executor.select({ fields: cmsModelVersions.fields }).from(sql`public.cms_model_versions AS cms_model_versions`).where(and(eq(cmsModelVersions.id, definition.modelVersionId), eq(cmsModelVersions.modelId, definition.modelId!))).limit(1) : [];
  if (definition.modelVersionId && !modelVersion) throw new HTTPException(409, { message: '集合固定模型版本已缺失，请重新保存集合' });
  const filters = definition.filters.map(filter => {
    const field = sql`${cmsContents.extend}->>${filter.field}`;
    const value = typeof filter.value === 'number' ? filter.value : String(filter.value);
    const type = typeof filter.value === 'boolean' ? 'boolean' : typeof filter.value === 'number' ? 'number' : 'string';
    const comparable = typeof filter.value === 'number' ? sql`case when jsonb_typeof(${cmsContents.extend}->${filter.field})='number' then (${field})::numeric end`
      : sql`case when jsonb_typeof(${cmsContents.extend}->${filter.field})=${type} then ${field} end`;
    return filter.op === 'eq' ? sql`${comparable} = ${value}` : filter.op === 'gte' ? sql`${comparable} >= ${value}` : sql`${comparable} <= ${value}`;
  });
  const where = buildWhere(base, definition.channelIds.length ? inArray(cmsContents.channelId, definition.channelIds) : undefined, definition.modelId ? eq(cmsContents.modelId, definition.modelId) : undefined,
    definition.locale ? eq(cmsContents.locale, definition.locale) : undefined, definition.contentType ? eq(cmsContents.contentType, definition.contentType) : undefined,
    ...definition.tagIds.map(tagId => sql`exists(select 1 from ${cmsContentTags} where ${cmsContentTags.contentId}=${cmsContents.id} and ${cmsContentTags.tagId}=${tagId})`), ...filters);
  const numericSort = modelVersion?.fields.some(field => field.name === definition.sortField && field.fieldType === 'number');
  const sortField: SQL | typeof cmsContents.title = definition.sort === 'title' ? cmsContents.title : definition.sort === 'field'
    ? numericSort ? sql`case when jsonb_typeof(${cmsContents.extend}->${definition.sortField})='number' then (${cmsContents.extend}->>${definition.sortField})::numeric end` : sql`${cmsContents.extend}->>${definition.sortField}`
    : sql`${cmsContents.publishedAt}`;
  const count = Math.min(definition.limit, options.limit ?? 100);
  const pinned = definition.pinnedIds.length ? await executor.select(cmsContentListColumns).from(cmsContents).where(buildWhere(base, inArray(cmsContents.id, definition.pinnedIds))).limit(100) : [];
  const remaining = await executor.select(cmsContentListColumns).from(cmsContents).where(buildWhere(where, definition.pinnedIds.length ? notInArray(cmsContents.id, definition.pinnedIds) : undefined)).orderBy(sql`${definition.direction === 'asc' ? asc(sortField) : desc(sortField)} nulls last`, desc(cmsContents.id)).limit(count);
  const rows = [...definition.pinnedIds.flatMap(contentId => pinned.filter(row => row.id === contentId)), ...remaining].slice(0, count);
  return 'rollback' in executor ? withDbExecutor(executor, () => resolveCmsContentRows(rows, siteId)) : resolveCmsContentRows(rows, siteId);
}
export async function previewCmsCollection(id: number) {
  const row = await requireCollection(id);
  const allowedChannelIds = await getAccessibleChannelIds();
  const contentScope = await cmsContentDataScope();
  return withCmsPublicGeneration(row.siteId, async () => {
    const site = await ensureCmsSiteExists(row.siteId);
    const rows = await resolveCmsCollection(row.siteId, id, { definition: row.definition, allowedChannelIds, contentScope });
    const channels = rows.length ? await db.select({ id: cmsChannels.id, path: cmsChannels.path, detailPathRule: cmsChannels.detailPathRule }).from(cmsChannels).where(inArray(cmsChannels.id, rows.map(item => item.channelId))) : [];
    return { version: row.version, items: rows.map(item => ({ id: item.id, title: item.title, reason: row.definition.pinnedIds.includes(item.id) ? '人工固定' : '匹配集合筛选', canonicalUrl: buildCmsContentUrls(item, { siteCode: site.code, channelPath: channels.find(channel => channel.id === item.channelId)?.path, detailPathRule: channels.find(channel => channel.id === item.channelId)?.detailPathRule }).canonicalUrl ?? null })) };
  });
}

/** The gateway supplies a public generation scope and cms:read authorization. */
export async function readPublicCmsCollection(siteId: number, id: number) {
  const generation = cmsGenerationContext();
  if (!generation || generation.siteId !== siteId || !await hasCmsGenerationTable(db, generation.generationId, 'cms_content_collections')) throw new HTTPException(404, { message: '当前公开版本没有此内容集合' });
  const row = requireRow((await db.select().from(cmsContentCollections).where(and(eq(cmsContentCollections.id, id), eq(cmsContentCollections.siteId, siteId))).limit(1))[0], '公开集合不存在');
  const site = await ensureCmsSiteExists(siteId);
  const rows = await resolveCmsCollection(siteId, id);
  const channels = rows.length ? await db.select({ id: cmsChannels.id, path: cmsChannels.path, detailPathRule: cmsChannels.detailPathRule }).from(cmsChannels).where(inArray(cmsChannels.id, rows.map(item => item.channelId))) : [];
  return { version: row.version, items: rows.map(item => ({ id: item.id, title: item.title, reason: row.definition.pinnedIds.includes(item.id) ? '人工固定' : '匹配集合筛选', canonicalUrl: buildCmsContentUrls(item, { siteCode: site.code, channelPath: channels.find(channel => channel.id === item.channelId)?.path, detailPathRule: channels.find(channel => channel.id === item.channelId)?.detailPathRule }).canonicalUrl ?? null })) };
}
