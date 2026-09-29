import { CMS_CONTENT_REVIEW_ISSUE_LABELS, cmsContentReviewContract, parseCmsLink, type CmsContentReviewIssue, type CmsContentReviewPolicy, type CmsEditorialTask } from '@zenith/shared/cms';
import { mockCmsChannels, mockCmsContents, mockCmsPages, mockCmsSites } from '../data/cms';
import { mockCmsReviewPolicies, mockCmsReviewRecords, mockCmsReviewIssueCycles } from '../data/cms-reviews';
import { mockCmsEditorialTasks, mockCmsEditorialRounds } from '../data/cms-operations';
import { mockUsers } from '../data/users';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem } from '../utils/crud';
import { badRequest, conflict, nextIdFrom } from '../utils/handlers';
import { mockDateTime } from '../utils/date';
import { getMockCmsPublishedContent, getMockCmsRevision, getMockCmsWorkingContent } from '../utils/cms-revisions';
import { appendMockEditorialHistory, createMockEditorialRound } from '../utils/cms-editorial-outcomes';
import { mockCmsReferencedResourceRights, mockCmsRevisionResourcesVisible } from '../utils/cms-resource-rights';
import { getMockCmsActivePublication } from './cms-releases';
import { createProgressingMockTask, setMockTaskItems } from './async-tasks';

const DAY_MS = 86400000;
const sourceTasks = new Map<string, number>();
function requireOwner(id: number | null) {
  const owner = id ? requireItem(mockUsers, id, '复核负责人不存在', { status: 400 }) : null;
  if (owner && (owner.status !== 'enabled' || owner.tenantId != null)) throw new MockHttpError(badRequest('复核负责人不存在或已停用', { status: 400 }));
  return owner?.nickname ?? null;
}
function policy(contentId: number): CmsContentReviewPolicy {
  const content = getMockCmsWorkingContent(contentId);
  const current = mockCmsReviewPolicies.find(row => row.contentId === contentId);
  const values = current ?? { contentId, siteId: content.siteId, contentTitle: content.title, version: 0, enabled: false, ownerId: null, ownerName: null, intervalDays: 90, noticeDays: 30, nextReviewAt: null, validUntil: null, checkLinks: true, checkAssetRights: true, activeRevisionId: null, lastReviewedAt: null, lastReviewedRevisionId: null, lastCheckedAt: null, lastCheckTaskId: null, issues: [] };
  return { ...values, contentTitle: content.title, ownerName: requireOwner(values.ownerId), activeRevisionId: getMockCmsActivePublication(contentId)?.revisionId ?? null };
}
const issue = (kind: CmsContentReviewIssue['kind'], target: string, summary: string): CmsContentReviewIssue => ({ key: `${kind}:${target}`, kind, target, summary, taskId: null });
function linksFor(snapshot: Record<string, unknown>) {
  const document = new DOMParser().parseFromString(typeof snapshot.body === 'string' ? snapshot.body : '', 'text/html');
  return [...new Set([...document.querySelectorAll('a[href]')].map(link => link.getAttribute('href')!).concat(typeof snapshot.externalLink === 'string' && snapshot.externalLink ? [snapshot.externalLink] : []))];
}
function linkAvailable(siteId: number, value: string): boolean | null {
  if (value.startsWith('#')) return true;
  const ref = parseCmsLink(value);
  if (!ref) return false;
  if (ref.kind === 'external') return /^https?:/i.test(ref.url) ? null : true; // The browser mock does not claim that an external server was probed.
  if (ref.kind === 'entity') {
    if (ref.entityType === 'content') return ref.id !== null && getMockCmsPublishedContent(ref.id)?.siteId === siteId;
    const channel = mockCmsChannels.find(row => row.siteId === siteId && (ref.id !== null ? row.id === ref.id : row.code === ref.code));
    return channel?.status === 'enabled';
  }
  const pathname = ref.path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  if (!pathname || pathname === 'index.html' || pathname === 'search') return true;
  if (mockCmsPages.some(row => row.siteId === siteId && row.status === 'enabled' && (row.path?.replace(/^\/+|\/+$/g, '') === pathname || `p/${row.slug}` === pathname))) return true;
  if (mockCmsChannels.some(row => row.siteId === siteId && row.status === 'enabled' && row.path === pathname)) return true;
  if (mockCmsContents.some(row => row.siteId === siteId && getMockCmsPublishedContent(row.id) && (row.staticPath?.replace(/^\/+|\/+$/g, '') === pathname || mockCmsChannels.some(channel => channel.id === row.channelId && channel.status === 'enabled' && `${channel.path}/${row.slug ?? row.id}.html` === pathname)))) return true;
  return false;
}
function reviewTask(current: CmsContentReviewPolicy, finding: CmsContentReviewIssue, revisionId: number, generationId: number, scanTaskId: number) {
  const cycles = mockCmsReviewIssueCycles.get(current.contentId) ?? {};
  const cycle = current.issues.some(row => row.key === finding.key) ? cycles[finding.key] ?? 1 : (cycles[finding.key] ?? 0) + 1;
  cycles[finding.key] = cycle; mockCmsReviewIssueCycles.set(current.contentId, cycles);
  const sourceKey = `review:${current.contentId}:${finding.key}:${cycle}`;
  const existing = sourceTasks.get(sourceKey);
  if (existing && mockCmsEditorialTasks.some(row => row.id === existing)) return existing;
  const row: CmsEditorialTask = { id: nextIdFrom(mockCmsEditorialTasks), siteId: current.siteId, title: `${CMS_CONTENT_REVIEW_ISSUE_LABELS[finding.kind]}：${current.contentTitle}`.slice(0, 255), description: finding.summary, source: 'review', sourceKeyword: null, feedbackId: null, ownerId: current.ownerId, ownerName: current.ownerName, dueAt: mockDateTime(), status: 'open', version: 1, roundNo: 1, contentId: current.contentId, contentTitle: current.contentTitle, contentStatus: 'published', editorialStatus: null, publishedRevisionId: revisionId, hasUnpublishedChanges: false, createdAt: mockDateTime(), updatedAt: mockDateTime() };
  mockCmsEditorialTasks.push(row); sourceTasks.set(sourceKey, row.id);
  const sourceEvidence = { kind: 'review' as const, summary: finding.summary, capturedAt: new Date().toISOString(), snapshot: null, metadata: { contentId: current.contentId, revisionId, generationId, target: finding.target, occurrence: cycle, scanTaskId, reviewKind: finding.kind } };
  createMockEditorialRound(row, sourceEvidence); appendMockEditorialHistory(row, 'created', null, { sourceEvidence }, true);
  return row.id;
}

function confirmPeriodicReviewTasks(current: CmsContentReviewPolicy, live: NonNullable<ReturnType<typeof getMockCmsActivePublication>>, recordId: number, note: string) {
  const revision = getMockCmsRevision(live.revisionId);
  if (!revision || !mockCmsRevisionResourcesVisible(revision.snapshot)) return new Set<number>();
  const confirmed = new Set<number>();
  for (const finding of current.issues.filter(row => row.kind === 'review_due' && row.taskId)) {
    const task = mockCmsEditorialTasks.find(row => row.id === finding.taskId && row.siteId === current.siteId && row.contentId === current.contentId && row.source === 'review');
    if (!task) continue;
    const round = mockCmsEditorialRounds.find(row => row.taskId === task.id && row.roundNo === task.roundNo);
    if (!round || round.closedAt || round.interruptedAt || round.sourceEvidence.metadata.reviewKind !== 'review_due' || (round.goal && round.goal.metric !== 'manual') || (round.solutionRevisionId && round.solutionRevisionId !== revision.id)) continue;
    if (task.status === 'verified') { confirmed.add(task.id); continue; }
    if (!['open', 'in_progress', 'edit_done', 'online', 'observing'].includes(task.status)) continue;
    Object.assign(round, { solutionRevisionId: revision.id, solutionHash: revision.hash, goal: { metric: 'manual', targetValue: 0, minSample: 30, description: '核实当前在线修订的准确性并记录人工复核结论' }, releaseId: live.releaseId, deploymentId: live.deploymentId, activationId: live.activationId, activatedAt: live.activatedAt, verifiedAt: mockDateTime() });
    task.status = 'verified'; task.version += 1;
    appendMockEditorialHistory(task, 'review_confirmed', note, { reviewRecordId: recordId, revisionId: revision.id, revisionHash: revision.hash, deploymentId: live.deploymentId, activationId: live.activationId, verification: '定期人工复核完成，不推断访问或转化指标改善' });
    confirmed.add(task.id);
  }
  return confirmed;
}

export const cmsContentReviewHandlers = [
  mock(cmsContentReviewContract.list, ({ query, ok, paginate }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    return ok(paginate(mockCmsReviewPolicies.filter(row => row.siteId === query.siteId).map(row => policy(row.contentId)).filter(row => !query.keyword || row.contentTitle.includes(query.keyword)).sort((a, b) => (a.nextReviewAt ?? '9999').localeCompare(b.nextReviewAt ?? '9999') || a.contentId - b.contentId)));
  }),
  mock(cmsContentReviewContract.detail, ({ params, ok }) => ok(policy(params.id))),
  mock(cmsContentReviewContract.save, ({ params, body, ok }) => {
    const current = policy(params.id);
    if (current.version !== body.expectedVersion) return conflict('复核策略已更新，请刷新后重试', { status: 409 });
    const { expectedVersion, ...fields } = body;
    const saved = { ...current, ...fields, ownerName: requireOwner(body.ownerId), version: expectedVersion + 1, nextReviewAt: body.nextReviewAt ?? (body.enabled ? mockDateTime(Date.now() + body.intervalDays * DAY_MS) : null) };
    const index = mockCmsReviewPolicies.findIndex(row => row.contentId === params.id);
    if (index < 0) mockCmsReviewPolicies.push(saved); else mockCmsReviewPolicies[index] = saved;
    return ok(policy(params.id));
  }),
  mock(cmsContentReviewContract.records, ({ params, ok }) => { getMockCmsWorkingContent(params.id); return ok(mockCmsReviewRecords.filter(row => row.contentId === params.id).sort((a, b) => b.id - a.id).slice(0, 50)); }),
  mock(cmsContentReviewContract.complete, ({ params, body, ok }) => {
    const current = mockCmsReviewPolicies.find(row => row.contentId === params.id); getMockCmsWorkingContent(params.id);
    if (!current) return conflict('请先保存复核策略', { status: 409 });
    if (current.version !== body.expectedVersion) return conflict('复核策略已更新，请刷新后重试', { status: 409 });
    const live = getMockCmsActivePublication(params.id);
    if (!live || live.revisionId !== body.revisionId) return conflict('当前稿件没有可复核的在线修订或在线修订已变化', { status: 409 });
    const nextReviewAt = mockDateTime(Date.now() + current.intervalDays * DAY_MS);
    const recordId = nextIdFrom(mockCmsReviewRecords);
    mockCmsReviewRecords.push({ id: recordId, contentId: params.id, revisionId: live.revisionId, generationId: live.deploymentId, note: body.note, actorName: '演示管理员', nextReviewAt, createdAt: mockDateTime() });
    const confirmed = confirmPeriodicReviewTasks(current, live, recordId, body.note);
    Object.assign(current, { version: current.version + 1, lastReviewedAt: mockDateTime(), lastReviewedRevisionId: live.revisionId, nextReviewAt, issues: current.issues.filter(row => row.kind !== 'review_due' || !row.taskId || !confirmed.has(row.taskId)) });
    return ok(policy(params.id));
  }),
  mock(cmsContentReviewContract.scan, ({ body, ok }) => {
    requireItem(mockCmsSites, body.siteId, '站点不存在', { status: 404 });
    if (body.contentId && getMockCmsWorkingContent(body.contentId).siteId !== body.siteId) return badRequest('稿件不属于所选站点', { status: 400 });
    const candidates = mockCmsReviewPolicies.filter(row => row.siteId === body.siteId && row.enabled && (!body.contentId || row.contentId === body.contentId)).map(row => ({ contentId: row.contentId, version: row.version, publication: getMockCmsActivePublication(row.contentId) }));
    const task = createProgressingMockTask({ taskType: 'cms-content-review-scan', title: 'CMS 内容复核巡检', totalItems: Math.max(1, candidates.length), payload: { ...body, scheduled: false },
      onSuccess(completed) {
        let checked = 0; let skipped = 0; let externalLinksUnchecked = 0;
        const items: Parameters<typeof setMockTaskItems>[1] = [];
        for (const candidate of candidates) {
          const current = mockCmsReviewPolicies.find(row => row.contentId === candidate.contentId);
          const live = getMockCmsActivePublication(candidate.contentId);
          if (!current?.enabled || current.version !== candidate.version || live?.deploymentId !== candidate.publication?.deploymentId || live?.revisionId !== candidate.publication?.revisionId) { skipped += 1; continue; }
          const revision = live ? getMockCmsRevision(live.revisionId) : null;
          const issues: CmsContentReviewIssue[] = [];
          if (live && revision) {
            const now = Date.now(); const deadline = now + current.noticeDays * DAY_MS;
            if (current.nextReviewAt && new Date(current.nextReviewAt).getTime() <= now) issues.push(issue('review_due', current.nextReviewAt, '已到定期复核时间，请核实当前在线内容是否仍然准确。'));
            const expiry = (value: string | null, target: string) => { if (value && new Date(value).getTime() <= deadline) issues.push(issue(new Date(value).getTime() <= now ? 'validity_expired' : 'validity_expiring', target, '内容资料有效期已到或临近，请更新资料或安排撤下。')); };
            expiry(current.validUntil, current.validUntil ?? '');
            if (typeof revision.snapshot.expireAt === 'string') expiry(revision.snapshot.expireAt, `publication:${revision.id}:${revision.snapshot.expireAt}`);
            if (current.checkAssetRights) for (const rights of mockCmsReferencedResourceRights(revision.snapshot)) {
              const expires = rights.expiresAt ? new Date(rights.expiresAt).getTime() : null;
              const kind = rights.revoked ? 'asset_revoked' : expires !== null && expires <= now ? 'asset_expired' : expires !== null && expires <= deadline ? 'asset_expiring' : null;
              if (kind) issues.push(issue(kind, `${rights.resourceId}:${rights.expiresAt ?? 'revoked'}`, `素材 #${rights.resourceId}：${CMS_CONTENT_REVIEW_ISSUE_LABELS[kind]}。`));
            }
            if (current.checkLinks) {
              const broken: string[] = [];
              for (const link of linksFor(revision.snapshot)) { const available = linkAvailable(current.siteId, link); if (available === null) externalLinksUnchecked += 1; else if (!available) broken.push(link); }
              if (broken.length) issues.push(issue('broken_link', `revision:${revision.id}`, `发现 ${broken.length} 个站内无效链接：\n${broken.join('\n')}`.slice(0, 3000)));
            }
            for (const finding of issues) finding.taskId = reviewTask(current, finding, live.revisionId, live.deploymentId, completed.id);
            checked += 1;
          } else skipped += 1;
          Object.assign(current, { issues, lastCheckedAt: mockDateTime(), lastCheckTaskId: completed.id });
          items.push({ id: items.length + 1, taskId: completed.id, itemKey: `content:${candidate.contentId}`, label: current.contentTitle, status: live ? 'success' : 'skipped', message: live ? `已检查在线修订，发现 ${issues.length} 项问题；外部链接需在实际环境检测` : '当前没有在线修订，本轮跳过', data: { contentId: current.contentId, revisionId: live?.revisionId ?? null, issues: issues.length }, attempt: completed.attempts, createdAt: mockDateTime(), updatedAt: mockDateTime() });
        }
        completed.result = { processed: candidates.length, checked, skipped, externalLinksUnchecked, message: 'Demo 已核验现有在线修订和站内数据，未执行外部网络探测' };
        setMockTaskItems(completed.id, items);
      } });
    return ok(task, '内容复核巡检已提交');
  }),
];

export function resetMockCmsContentReviews() { mockCmsReviewPolicies.length = 0; mockCmsReviewRecords.length = 0; mockCmsReviewIssueCycles.clear(); sourceTasks.clear(); }
