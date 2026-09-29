import { createHash } from 'node:crypto';
import { eq, gt, inArray, lte } from 'drizzle-orm';
import type { BodyOf } from '@zenith/shared/core';
import { CMS_CONTENT_REVIEW_ISSUE_LABELS, CMS_RESOURCE_URI_PREFIX, cmsContentReviewContract, serializeCmsBodyDocument, type CmsContentReviewIssue } from '@zenith/shared/cms';
import { db, readSnapshot } from '../../db';
import { asyncTasks, cmsAssetRights, cmsAssetVersions, cmsContentReviewPolicies, cmsContents, cmsResources, cmsSiteGenerations } from '../../db/schema';
import { currentUserOrNull, hasPermission } from '../../lib/context';
import { HTTPException } from 'hono/http-exception';
import { buildWhere } from '../../lib/where-helpers';
import { parseDateTimeInput } from '../../lib/datetime';
import { mapWithConcurrency } from '../../lib/concurrency';
import { enqueueAsyncTask, persistSystemAsyncTask, registerTaskHandler, submitAsyncTask, type TaskRunContext } from '../../lib/task-center';
import { assertAllCmsSiteChannelsAccess } from './cms-channels.service';
import { getCmsContent } from './cms-contents-query.service';
import { assertSiteAccess } from './cms-sites.service';
import { createCmsEditorialTaskFromReview } from './cms-editorial-tasks.service';
import { loadCmsLiveReviewSubject, type CmsLiveReviewSubject } from './cms-content-reviews.service';
import { checkCmsExternalLink, checkCmsInternalLink, extractCmsContentLinks } from './cms-deadlink.service';
import { buildCmsLinkResolver } from './cms-link.service';
import { withCmsGenerationTransaction } from './cms-generation-storage.service';
import { acquireCmsSitePublishLock } from './cms-site-publish-lock.service';

export const CMS_CONTENT_REVIEW_TASK = 'cms-content-review-scan';
type Policy = typeof cmsContentReviewPolicies.$inferSelect;
const issueKey = (kind: CmsContentReviewIssue['kind'], target: string) => `${kind}:${createHash('sha256').update(target).digest('hex').slice(0, 24)}`;
const issue = (kind: CmsContentReviewIssue['kind'], target: string, summary: string): CmsContentReviewIssue => ({ key: issueKey(kind, target), kind, target, summary, taskId: null });

export function cmsReviewDateIssues(policy: Pick<Policy, 'nextReviewAt' | 'validUntil' | 'noticeDays'>, now: Date): CmsContentReviewIssue[] {
  const found: CmsContentReviewIssue[] = [];
  if (policy.nextReviewAt && policy.nextReviewAt <= now) found.push(issue('review_due', policy.nextReviewAt.toISOString(), '已到定期复核时间，请核实当前在线内容是否仍然准确。'));
  if (policy.validUntil && policy.validUntil.getTime() <= now.getTime() + policy.noticeDays * 86400000) {
    const kind = policy.validUntil <= now ? 'validity_expired' : 'validity_expiring';
    found.push(issue(kind, policy.validUntil.toISOString(), `${CMS_CONTENT_REVIEW_ISSUE_LABELS[kind]}，请更新资料或安排撤下。`));
  }
  return found;
}

async function checkLinks(siteId: number, live: CmsLiveReviewSubject, contentId: number, ctx: TaskRunContext, cache: Map<string, boolean>): Promise<string[]> {
  const rawLinks = extractCmsContentLinks(live.snapshot.bodyDocument ? serializeCmsBodyDocument(live.snapshot.bodyDocument) : live.snapshot.body ?? '');
  if (live.snapshot.externalLink) rawLinks.push(live.snapshot.externalLink);
  if (live.snapshot.sourceUrl) rawLinks.push(live.snapshot.sourceUrl);
  const resolved = await withCmsGenerationTransaction(siteId, live.generationId, false, async () => {
    const ownRef = `entity:content/${contentId}`;
    const resolver = await buildCmsLinkResolver(siteId, '', [...rawLinks, ownRef]);
    const base = new URL(resolver(ownRef)?.url ?? '/', 'https://cms-review.invalid');
    const output: Array<{ raw: string; external?: string; ok?: boolean }> = [];
    for (const raw of [...new Set(rawLinks)]) {
      if (raw.startsWith(CMS_RESOURCE_URI_PREFIX)) {
        const resourceId = Number(raw.slice(CMS_RESOURCE_URI_PREFIX.length));
        const versionId = live.snapshot.assetVersions[String(resourceId)];
        const present = Number.isSafeInteger(resourceId) && !!versionId && await db.$count(cmsResources, eq(cmsResources.id, resourceId)) > 0
          && await db.$count(cmsAssetVersions, buildWhere(eq(cmsAssetVersions.id, versionId), eq(cmsAssetVersions.resourceId, resourceId))) > 0;
        output.push({ raw, ok: present }); continue;
      }
      let target = resolver(raw)?.url;
      if (!target && !/^[a-z][a-z0-9+.-]*:/iu.test(raw)) {
        try { const relative = new URL(raw, base); target = relative.origin === base.origin ? relative.pathname + relative.search : relative.href; } catch { /* invalid link becomes a finding */ }
      }
      if (!target) output.push({ raw, ok: false });
      else if (target.startsWith('/')) output.push({ raw, ok: await checkCmsInternalLink(siteId, target) });
      else if (/^https?:\/\//iu.test(target)) output.push({ raw, external: target });
      else output.push({ raw, ok: true });
    }
    return output;
  });
  const broken: string[] = [];
  for (let index = 0; index < resolved.length; index += 10) {
    if (await ctx.isCancelRequested()) return broken;
    const results = await mapWithConcurrency(resolved.slice(index, index + 10), 5, async link => {
      let ok = link.ok;
      if (link.external) {
        ok = cache.get(link.external);
        if (ok === undefined) { ok = (await checkCmsExternalLink(link.external)).ok; cache.set(link.external, ok); }
      }
      return { raw: link.raw, ok: ok === true };
    });
    for (const link of results) {
      if (!link.ok) broken.push(link.raw);
      await ctx.reportItems([{ key: `link:${contentId}:${createHash('sha256').update(link.raw).digest('hex').slice(0, 32)}`, label: live.title, status: link.ok ? 'success' : 'failed', message: link.ok ? '链接可访问' : '链接不可访问或不允许探测', data: { contentId, revisionId: live.revisionId, url: link.raw } }]);
    }
  }
  return broken;
}

async function inspectPolicy(policy: Policy, ctx: TaskRunContext, cache: Map<string, boolean>) {
  const live = await readSnapshot(tx => loadCmsLiveReviewSubject(policy.siteId, policy.contentId, tx));
  const now = new Date(); const issues = live ? cmsReviewDateIssues(policy, now) : [];
  if (live?.snapshot.expireAt) {
    const expires = parseDateTimeInput(live.snapshot.expireAt);
    if (expires && expires.getTime() <= now.getTime() + policy.noticeDays * 86400000) issues.push(issue(expires <= now ? 'validity_expired' : 'validity_expiring', `publication:${live.revisionId}:${expires.toISOString()}`, '已发布稿件已到或即将到计划下线时间，请确认有效期及替代资料。'));
  }
  if (live && policy.checkAssetRights) {
    const ids = Object.keys(live.snapshot.assetVersions ?? {}).map(Number).filter(Number.isSafeInteger);
    const rights = ids.length ? await db.select().from(cmsAssetRights).where(inArray(cmsAssetRights.resourceId, ids)) : [];
    for (const asset of rights) {
      const kind = asset.revoked ? 'asset_revoked' : asset.expiresAt && asset.expiresAt <= now ? 'asset_expired' : asset.expiresAt && asset.expiresAt.getTime() <= now.getTime() + policy.noticeDays * 86400000 ? 'asset_expiring' : null;
      if (kind) issues.push(issue(kind, `${asset.resourceId}:${asset.expiresAt?.toISOString() ?? asset.updatedAt.toISOString()}`, `素材 #${asset.resourceId}（固定版本 ${live.snapshot.assetVersions[String(asset.resourceId)]}）：${CMS_CONTENT_REVIEW_ISSUE_LABELS[kind]}。`));
    }
  }
  if (live && policy.checkLinks) {
    const broken = await checkLinks(policy.siteId, live, policy.contentId, ctx, cache);
    if (broken.length) issues.push(issue('broken_link', `revision:${live.revisionId}`, `发现 ${broken.length} 个不可访问的链接：\n${broken.join('\n')}`.slice(0, 3000)));
  }
  if (await ctx.isCancelRequested()) return;
  await db.transaction(async tx => {
    await acquireCmsSitePublishLock(tx, policy.siteId);
    const [owned] = await tx.select({ id: asyncTasks.id }).from(asyncTasks).where(buildWhere(eq(asyncTasks.id, ctx.taskId), eq(asyncTasks.dispatchToken, ctx.dispatchToken), eq(asyncTasks.status, 'running'), eq(asyncTasks.cancelRequested, false))).for('share').limit(1);
    if (!owned) return;
    await tx.select({ id: cmsContents.id }).from(cmsContents).where(eq(cmsContents.id, policy.contentId)).for('share');
    const [pointer] = await tx.select().from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId, policy.siteId)).for('share').limit(1);
    if (live && pointer?.activeGenerationId !== live.generationId) return;
    const currentLive = await loadCmsLiveReviewSubject(policy.siteId, policy.contentId, tx);
    if ((currentLive?.revisionId ?? null) !== (live?.revisionId ?? null)) return;
    const [current] = await tx.select().from(cmsContentReviewPolicies).where(eq(cmsContentReviewPolicies.contentId, policy.contentId)).for('update').limit(1);
    if (!current?.enabled || current.version !== policy.version) return;
    const issueCycles = { ...current.issueCycles };
    for (const finding of issues) {
      const ongoing = current.issues.find(item => item.key === finding.key);
      const cycle = ongoing ? issueCycles[finding.key] ?? 1 : (issueCycles[finding.key] ?? 0) + 1;
      issueCycles[finding.key] = cycle;
      const task = await createCmsEditorialTaskFromReview(tx, {
        siteId: policy.siteId, contentId: policy.contentId, title: `${CMS_CONTENT_REVIEW_ISSUE_LABELS[finding.kind]}：${live!.title}`.slice(0, 255),
        description: finding.summary, ownerId: current.ownerId, dueAt: now,
        sourceKey: `review:${policy.contentId}:${finding.key}:${cycle}`,
        evidence: { summary: finding.summary, reviewKind: finding.kind, metadata: { contentId: policy.contentId, revisionId: live!.revisionId, generationId: live!.generationId, target: finding.target, occurrence: cycle, scanTaskId: ctx.taskId } },
      });
      finding.taskId = task.id;
    }
    await tx.update(cmsContentReviewPolicies).set({ issues, issueCycles, lastCheckedAt: now, nextCheckAt: new Date(now.getTime() + 86400000), lastCheckTaskId: ctx.taskId }).where(eq(cmsContentReviewPolicies.contentId, policy.contentId));
  });
  await ctx.reportItems([{ key: `content:${policy.contentId}`, label: live?.title ?? `稿件 #${policy.contentId}`, status: live ? 'success' : 'skipped', message: live ? `完成巡检，发现 ${issues.length} 项需处理问题` : '当前没有在线修订，本轮跳过', data: { contentId: policy.contentId, revisionId: live?.revisionId ?? null, issues: issues.length } }]);
}

export async function submitCmsContentReviewScan(input: BodyOf<typeof cmsContentReviewContract.scan>) {
  if (!await hasPermission('cms:content:list')) throw new HTTPException(403, { message: '没有查看复核稿件的权限' });
  await assertSiteAccess(input.siteId);
  if (input.contentId) {
    const content = await getCmsContent(input.contentId);
    if (content.siteId !== input.siteId) throw new HTTPException(400, { message: '稿件不属于所选站点' });
  } else await assertAllCmsSiteChannelsAccess(input.siteId);
  return submitAsyncTask({ taskType: CMS_CONTENT_REVIEW_TASK, title: 'CMS 内容复核巡检', payload: { ...input, scheduled: false }, idempotencyKey: `cms-review:${input.siteId}:${input.contentId ?? 'all'}:${Math.floor(Date.now() / 30000)}` });
}
export function registerCmsContentReviewTaskHandler() {
  registerTaskHandler({ taskType: CMS_CONTENT_REVIEW_TASK, title: 'CMS 内容复核巡检', module: 'CMS内容管理', allowConcurrent: true, maxAttempts: 3, retryDelayMs: 5000,
    async run(ctx) {
      const siteId = Number(ctx.payload.siteId); const contentId = Number(ctx.payload.contentId) || null;
      if (!Number.isSafeInteger(siteId) || siteId <= 0) throw new Error('巡检站点无效');
      const system = ctx.payload.scheduled === true && !currentUserOrNull();
      if (!system) {
        if (!await hasPermission('cms:editorial-task:manage') || !await hasPermission('cms:content:list')) throw new HTTPException(403, { message: '没有执行复核巡检的权限' });
        await assertSiteAccess(siteId);
        if (contentId) { if ((await getCmsContent(contentId)).siteId !== siteId) throw new Error('稿件不属于所选站点'); }
        else await assertAllCmsSiteChannelsAccess(siteId);
      }
      let after = Number(ctx.checkpoint?.after ?? 0); let processed = Number(ctx.checkpoint?.processed ?? 0); const cache = new Map<string, boolean>();
      const where = buildWhere(eq(cmsContentReviewPolicies.siteId, siteId), eq(cmsContentReviewPolicies.enabled, true), contentId ? eq(cmsContentReviewPolicies.contentId, contentId) : undefined);
      const total = await db.$count(cmsContentReviewPolicies, where);
      for (;;) {
        const policies = await db.select().from(cmsContentReviewPolicies).where(buildWhere(where, gt(cmsContentReviewPolicies.contentId, after))).orderBy(cmsContentReviewPolicies.contentId).limit(50);
        if (!policies.length) break;
        for (const policy of policies) {
          if (await ctx.isCancelRequested()) return { processed };
          await inspectPolicy(policy, ctx, cache); after = policy.contentId; processed++;
          if ((await ctx.progress({ processed, total, note: `已检查 ${processed}/${total} 篇内容`, checkpoint: { after, processed } })).cancelRequested) return { processed };
        }
      }
      return { processed };
    },
  });
}
export async function dispatchCmsContentReviewScans(): Promise<string> {
  const now = new Date();
  const sites = await db.selectDistinct({ siteId: cmsContentReviewPolicies.siteId }).from(cmsContentReviewPolicies).where(buildWhere(eq(cmsContentReviewPolicies.enabled, true), lte(cmsContentReviewPolicies.nextCheckAt, now))).limit(100);
  let submitted = 0;
  for (const site of sites) {
    const task = await db.transaction(tx => persistSystemAsyncTask(tx, { taskType: CMS_CONTENT_REVIEW_TASK, title: 'CMS 定期内容复核巡检', payload: { siteId: site.siteId, scheduled: true }, idempotencyKey: `cms-review-scheduled:${site.siteId}:${Math.floor(now.getTime() / 3600000)}` }, null));
    await enqueueAsyncTask(task.id); submitted++;
  }
  return `已提交 ${submitted} 个站点的内容复核巡检`;
}
