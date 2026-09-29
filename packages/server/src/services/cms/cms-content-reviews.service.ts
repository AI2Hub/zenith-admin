import { desc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { BodyOf, QueryOutputOf } from '@zenith/shared/core';
import { cmsContentContract, cmsContentReviewContract, type CmsContentReviewPolicy, type CmsContentReviewRecord, type CmsContentRevisionSnapshot } from '@zenith/shared/cms';
import { db, readSnapshot } from '../../db';
import type { DbExecutor } from '../../db/types';
import { cmsContents, cmsContentReviewPolicies, cmsContentReviewRecords, cmsContentWorkingCopies, cmsSiteGenerations, users } from '../../db/schema';
import { currentUser, hasPermission } from '../../lib/context';
import { requireRow } from '../../lib/db-assert';
import { buildWhere, keywordCondition, withPagination } from '../../lib/where-helpers';
import { buildListResult } from '../../lib/list-query';
import { formatDateTime, formatNullableDateTime, parseDateTimeInput } from '../../lib/datetime';
import { buildCmsContentListWhere, getCmsContent } from './cms-contents-query.service';
import { requireCmsOperationsAssignee } from './cms-feedback.service';
import { cmsGenerationSchemaName } from './cms-generation-storage.service';
import { assertSiteAccess } from './cms-sites.service';
import { acquireCmsSitePublishLock } from './cms-site-publish-lock.service';
import { confirmCmsPeriodicReviewTasks } from './cms-content-review-completion';

export type CmsLiveReviewSubject = { generationId: number; revisionId: number; title: string; snapshot: CmsContentRevisionSnapshot };
export async function loadCmsLiveReviewSubject(siteId: number, contentId: number, executor: DbExecutor = db): Promise<CmsLiveReviewSubject | null> {
  const [pointer] = await executor.select({ id: cmsSiteGenerations.activeGenerationId }).from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, siteId)).limit(1);
  if (!pointer?.id) return null;
  const schema = cmsGenerationSchemaName(pointer.id);
  const [row] = await executor.execute<{ revisionId: number; title: string; snapshot: CmsContentRevisionSnapshot }>(sql`
    select r.id as "revisionId",r.title,r.snapshot from ${sql.identifier(schema)}.${sql.identifier('cms_generation_revision_refs')} ref
    join public.cms_content_revisions r on r.id=ref.revision_id
    join public.cms_contents c on c.id=ref.content_id
    where ref.content_id=${contentId} and c.site_id=${siteId} and c.status='published' and c.deleted_at is null and c.archived_at is null
      and not exists(select 1 from public.cms_content_suppressions s where s.content_id=c.id) limit 1`);
  return row ? { ...row, generationId: pointer.id } : null;
}

type PolicyRow = typeof cmsContentReviewPolicies.$inferSelect;
async function requireReviewContent(contentId: number) {
  if (!await hasPermission('cms:content:list')) throw new HTTPException(403, { message: '没有查看复核稿件的权限' });
  return getCmsContent(contentId);
}
function mapPolicy(content: { id: number; siteId: number; title: string }, policy: PolicyRow | undefined, ownerName: string | null, activeRevisionId: number | null): CmsContentReviewPolicy {
  return {
    contentId: content.id, siteId: content.siteId, contentTitle: content.title, version: policy?.version ?? 0, enabled: policy?.enabled ?? false,
    ownerId: policy?.ownerId ?? null, ownerName, intervalDays: policy?.intervalDays ?? 90, noticeDays: policy?.noticeDays ?? 30,
    nextReviewAt: formatNullableDateTime(policy?.nextReviewAt), validUntil: formatNullableDateTime(policy?.validUntil), checkLinks: policy?.checkLinks ?? true, checkAssetRights: policy?.checkAssetRights ?? true,
    activeRevisionId, lastReviewedAt: formatNullableDateTime(policy?.lastReviewedAt), lastReviewedRevisionId: policy?.lastReviewedRevisionId ?? null,
    lastCheckedAt: formatNullableDateTime(policy?.lastCheckedAt), lastCheckTaskId: policy?.lastCheckTaskId ?? null, issues: policy?.issues ?? [],
  };
}
export async function getCmsContentReviewPolicy(contentId: number): Promise<CmsContentReviewPolicy> {
  const content = await requireReviewContent(contentId);
  const [row] = await db.select({ policy: cmsContentReviewPolicies, ownerName: users.nickname }).from(cmsContentReviewPolicies)
    .leftJoin(users, eq(users.id, cmsContentReviewPolicies.ownerId)).where(eq(cmsContentReviewPolicies.contentId, contentId)).limit(1);
  const live = await readSnapshot(tx => loadCmsLiveReviewSubject(content.siteId, contentId, tx));
  return mapPolicy(content, row?.policy, row?.ownerName ?? null, live?.revisionId ?? null);
}
export async function listCmsContentReviewPolicies(q: QueryOutputOf<typeof cmsContentReviewContract.list>) {
  await assertSiteAccess(q.siteId);
  const scope = await buildCmsContentListWhere(cmsContentContract.list.query.parse({ siteId: q.siteId }));
  const where = buildWhere(eq(cmsContentReviewPolicies.siteId, q.siteId),
    sql`exists(select 1 from ${cmsContents} where ${cmsContents.id}=${cmsContentReviewPolicies.contentId} and ${scope} and ${keywordCondition(q.keyword, [cmsContents.title]) ?? sql`true`})`);
  return buildListResult({ page: q.page, pageSize: q.pageSize,
    count: () => db.$count(cmsContentReviewPolicies, where),
    rows: () => withPagination(db.select({ policy: cmsContentReviewPolicies, content: { id: cmsContents.id, title: cmsContents.title, siteId: cmsContents.siteId }, ownerName: users.nickname, publishedRevisionId: cmsContentWorkingCopies.publishedRevisionId })
      .from(cmsContentReviewPolicies).innerJoin(cmsContents, eq(cmsContents.id, cmsContentReviewPolicies.contentId)).leftJoin(users, eq(users.id, cmsContentReviewPolicies.ownerId))
      .leftJoin(cmsContentWorkingCopies, eq(cmsContentWorkingCopies.contentId, cmsContents.id)).where(where).orderBy(cmsContentReviewPolicies.nextReviewAt, cmsContentReviewPolicies.contentId).$dynamic(), q.page, q.pageSize),
    map: row => mapPolicy(row.content, row.policy, row.ownerName, row.publishedRevisionId),
  });
}
export async function saveCmsContentReviewPolicy(contentId: number, input: BodyOf<typeof cmsContentReviewContract.save>) {
  const content = await requireReviewContent(contentId);
  if (input.ownerId) await requireCmsOperationsAssignee(input.ownerId, '复核负责人不存在或已停用');
  await db.transaction(async tx => {
    await acquireCmsSitePublishLock(tx, content.siteId);
    await tx.select({ id: cmsContents.id }).from(cmsContents).where(eq(cmsContents.id, contentId)).for('update');
    const [current] = await tx.select().from(cmsContentReviewPolicies).where(eq(cmsContentReviewPolicies.contentId, contentId)).for('update').limit(1);
    if ((current?.version ?? 0) !== input.expectedVersion) throw new HTTPException(409, { message: '复核策略已更新，请刷新后重试' });
    const { expectedVersion, nextReviewAt, validUntil, ...fields } = input;
    const values = { ...fields, version: expectedVersion + 1, nextReviewAt: nextReviewAt ? parseDateTimeInput(nextReviewAt) : input.enabled ? new Date(Date.now() + input.intervalDays * 86400000) : null,
      validUntil: validUntil ? parseDateTimeInput(validUntil) : null, nextCheckAt: new Date() };
    if (current) await tx.update(cmsContentReviewPolicies).set(values).where(eq(cmsContentReviewPolicies.contentId, contentId));
    else await tx.insert(cmsContentReviewPolicies).values({ ...values, contentId, siteId: content.siteId });
  });
  return getCmsContentReviewPolicy(contentId);
}
export async function listCmsContentReviewRecords(contentId: number): Promise<CmsContentReviewRecord[]> {
  await requireReviewContent(contentId);
  const rows = await db.select().from(cmsContentReviewRecords).where(eq(cmsContentReviewRecords.contentId, contentId)).orderBy(desc(cmsContentReviewRecords.id)).limit(50);
  return rows.map(row => ({ ...row, nextReviewAt: formatDateTime(row.nextReviewAt), createdAt: formatDateTime(row.createdAt) }));
}
export async function completeCmsContentReview(contentId: number, input: BodyOf<typeof cmsContentReviewContract.complete>) {
  const content = await requireReviewContent(contentId); const actor = currentUser();
  await db.transaction(async tx => {
    await acquireCmsSitePublishLock(tx, content.siteId);
    await tx.select({ id: cmsContents.id }).from(cmsContents).where(eq(cmsContents.id, contentId)).for('update');
    // Lock the active pointer so a release cannot change the subject while a review is recorded.
    await tx.select().from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, content.siteId)).for('share');
    const live = requireRow(await loadCmsLiveReviewSubject(content.siteId, contentId, tx), '当前稿件没有可复核的在线修订', 409);
    if (live.revisionId !== input.revisionId) throw new HTTPException(409, { message: '在线修订已变化，请重新检查后确认' });
    const [policy] = await tx.select().from(cmsContentReviewPolicies).where(eq(cmsContentReviewPolicies.contentId, contentId)).for('update').limit(1);
    requireRow(policy, '请先保存复核策略', 409);
    if (policy.version !== input.expectedVersion) throw new HTTPException(409, { message: '复核策略已更新，请刷新后重试' });
    const reviewedAt = new Date(); const nextReviewAt = new Date(reviewedAt.getTime() + policy.intervalDays * 86400000);
    const [record] = await tx.insert(cmsContentReviewRecords).values({ contentId, revisionId: live.revisionId, generationId: live.generationId, note: input.note, actorId: actor.userId, actorName: actor.username, nextReviewAt }).returning({ id: cmsContentReviewRecords.id });
    const confirmed = await confirmCmsPeriodicReviewTasks(tx, { siteId: content.siteId, contentId, revisionId: live.revisionId, generationId: live.generationId, recordId: record.id, note: input.note, issues: policy.issues });
    await tx.update(cmsContentReviewPolicies).set({ version: policy.version + 1, lastReviewedAt: reviewedAt, lastReviewedRevisionId: live.revisionId, nextReviewAt, nextCheckAt: reviewedAt, issues: policy.issues.filter(issue => issue.kind !== 'review_due' || !issue.taskId || !confirmed.includes(issue.taskId)) }).where(eq(cmsContentReviewPolicies.contentId, contentId));
  });
  return getCmsContentReviewPolicy(contentId);
}
