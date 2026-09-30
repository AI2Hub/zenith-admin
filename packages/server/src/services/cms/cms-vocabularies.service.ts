import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cmsVocabularyContract, cmsVocabularySchema, validateCmsVocabularySelection, inspectCmsTermHierarchy, cmsTermSubtreeHeight } from '@zenith/shared/cms';
import { db } from '../../db';
import { cmsModels, cmsTags, cmsVocabularies } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { defineCrudService } from '../../lib/crud-service';
import { entityMapper } from '../../lib/entity-map';
import { requireRow } from '../../lib/db-assert';
import { keywordCondition } from '../../lib/where-helpers';
import { assertSiteAccess, ensureCmsSiteExists } from './cms-sites.service';
import { refreshCmsPublicConfiguration } from './cms-public-config-refresh.service';

const map = entityMapper(cmsVocabularySchema);
async function validateModels(siteId: number, ids: number[]) {
  if (!ids.length) return;
  const rows = await db.select({ id: cmsModels.id }).from(cmsModels).where(and(inArray(cmsModels.id, ids), or(isNull(cmsModels.ownerSiteId), eq(cmsModels.ownerSiteId, siteId))));
  if (rows.length !== new Set(ids).size) throw new HTTPException(400, { message: '词表内容模型不存在或不属于本站' });
}
export const cmsVocabularyService = defineCrudService(cmsVocabularyContract, {
  table: cmsVocabularies, map, notFound: '词表不存在', unique: '词表编码已存在',
  list: q => ({ where: [eq(cmsVocabularies.siteId, q.siteId), keywordCondition(q.keyword, [cmsVocabularies.name, cmsVocabularies.code])], orderBy: [asc(cmsVocabularies.sort), asc(cmsVocabularies.id)] }),
  create: { before: async data => { await ensureCmsSiteExists(data.siteId); await assertSiteAccess(data.siteId); await validateModels(data.siteId, data.modelIds); }, after: async (_, row) => refreshCmsPublicConfiguration(row.siteId, '创建受控词表', `vocabulary:${row.id}`) },
  update: { before: async (data, row) => { await assertSiteAccess(row.siteId); if (data.modelIds) await validateModels(row.siteId, data.modelIds); }, after: async (_, row) => refreshCmsPublicConfiguration(row.siteId, '更新受控词表', `vocabulary:${row.id}`) },
  remove: { before: async row => { await assertSiteAccess(row.siteId); if (await db.$count(cmsTags, eq(cmsTags.vocabularyId, row.id))) throw new HTTPException(409, { message: '词表包含词条，请先处理词条' }); }, after: async row => refreshCmsPublicConfiguration(row.siteId, '删除受控词表', `vocabulary:${row.id}`) },
});
export async function listCmsVocabularies(q: Parameters<typeof cmsVocabularyService.list>[0]) {
  await ensureCmsSiteExists(q.siteId); await assertSiteAccess(q.siteId);
  return cmsVocabularyService.list(q);
}
export async function getCmsVocabulary(id: number) {
  const row = await cmsVocabularyService.ensure(id); await assertSiteAccess(row.siteId); return map(row);
}
export async function allCmsVocabularies(siteId: number) {
  await ensureCmsSiteExists(siteId); await assertSiteAccess(siteId);
  return (await db.select().from(cmsVocabularies).where(eq(cmsVocabularies.siteId, siteId)).orderBy(asc(cmsVocabularies.sort), asc(cmsVocabularies.id))).map(map);
}

/** Shared by draft saving and strict revision publication, within the owner's transaction. */
export async function validateCmsTaxonomyTags(executor: DbExecutor, siteId: number, modelId: number | null, ids: number[], strict: boolean) {
  const vocabularies = await executor.select().from(cmsVocabularies).where(eq(cmsVocabularies.siteId, siteId));
  const terms = ids.length ? await executor.select({ id: cmsTags.id, vocabularyId: cmsTags.vocabularyId }).from(cmsTags).where(and(eq(cmsTags.siteId, siteId), inArray(cmsTags.id, ids))) : [];
  if (terms.length !== new Set(ids).size) throw new HTTPException(400, { message: '标签或分类词条不存在或不属于本站' });
  const issues = validateCmsVocabularySelection(vocabularies, terms, modelId, strict);
  if (issues.length) throw new HTTPException(400, { message: issues.join('；') });
}

export async function assertCmsTermPlacement(executor: DbExecutor, siteId: number, input: { vocabularyId?: number | null; parentId?: number | null }, currentId?: number) {
  if (input.vocabularyId) {
    const [vocabulary] = await executor.select({ id: cmsVocabularies.id }).from(cmsVocabularies).where(and(eq(cmsVocabularies.id, input.vocabularyId), eq(cmsVocabularies.siteId, siteId))).limit(1);
    requireRow(vocabulary, '词表不存在或不属于本站');
  }
  const subtreeHeight = currentId == null ? 1 : cmsTermSubtreeHeight(currentId,
    await executor.select({ id: cmsTags.id, parentId: cmsTags.parentId }).from(cmsTags).where(eq(cmsTags.siteId, siteId)));
  const issue = await inspectCmsTermHierarchy(siteId, input, currentId, async id => (await executor.select({ id: cmsTags.id, siteId: cmsTags.siteId, parentId: cmsTags.parentId, vocabularyId: cmsTags.vocabularyId }).from(cmsTags).where(and(eq(cmsTags.id, id), eq(cmsTags.siteId, siteId))).limit(1))[0], subtreeHeight);
  if (issue) throw new HTTPException(400, { message: issue });
}
