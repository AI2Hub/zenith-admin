import type { BodyOf } from '@zenith/shared/core';
import dayjs from 'dayjs';
import { assessCmsEditorialOutcome, cmsOperationsContract, cmsStatContract, cmsStatMetricsSchema, normalizeCmsSearchKeyword, type CmsEditorialMetricSnapshot, type CmsEditorialSourceEvidence, type CmsEditorialTask, type CmsEditorialTaskDetail, type CmsEditorialTaskRound } from '@zenith/shared/cms';
import { mockCmsEditorialTasks, mockCmsEditorialRounds, mockCmsEditorialObservations, mockCmsEditorialHistory } from '../data/cms-operations';
import { getMockCmsStatsReportRows } from '../handlers/cms-stats';
import { getMockCmsActivePublication, getMockCmsSiteActivations } from '../handlers/cms-releases';
import { getMockCmsRevision, getMockCmsWorkingContent } from './cms-revisions';
import { MockHttpError } from './contract';
import { badRequest, conflict, nextIdFrom } from './handlers';
import { requireItem } from './crud';
import { mockDateTime } from './date';
import { mockCmsRevisionResourcesVisible } from './cms-resource-rights';

const DAY_MS = 86400000;
const SETTLEMENT_MS = (24 * 60 + 15) * 60000;
const reject = (message: string) => { throw new MockHttpError(conflict(message, { status: 409 })); };
const invalid = (message: string) => { throw new MockHttpError(badRequest(message, { status: 400 })); };
export function assertMockEditorialVersion(task: CmsEditorialTask, version: number) {
  if (task.version !== version) reject('事项已更新，请刷新后重试');
}
function currentRound(task: CmsEditorialTask) {
  return requireItem(mockCmsEditorialRounds, mockCmsEditorialRounds.find(row => row.taskId === task.id && row.roundNo === task.roundNo)?.id ?? 0, '本轮处理记录不存在', { status: 409 });
}
export function appendMockEditorialHistory(task: CmsEditorialTask, action: string, note: string | null, snapshot: Record<string, unknown> = {}, system = false) {
  task.updatedAt = mockDateTime();
  mockCmsEditorialHistory.unshift({ id: nextIdFrom(mockCmsEditorialHistory), taskId: task.id, roundNo: task.roundNo, version: task.version, action, note, actorId: system ? null : 1, actorName: system ? '系统' : '演示管理员', snapshot: { status: task.status, contentId: task.contentId, ...structuredClone(snapshot) }, createdAt: task.updatedAt });
}
export function createMockEditorialRound(task: CmsEditorialTask, sourceEvidence: CmsEditorialSourceEvidence) {
  const round: CmsEditorialTaskRound = { id: nextIdFrom(mockCmsEditorialRounds), taskId: task.id, roundNo: task.roundNo, sourceEvidence: structuredClone(sourceEvidence), goal: null, solutionRevisionId: null, solutionHash: null, releaseId: null, deploymentId: null, activationId: null, activatedAt: null, interruptedAt: null, interruptionReason: null, verifiedAt: null, closedAt: null, createdAt: mockDateTime() };
  mockCmsEditorialRounds.push(round);
  return round;
}
export function mockEditorialDetail(task: CmsEditorialTask): CmsEditorialTaskDetail {
  return { ...task, canViewMetrics: true, rounds: mockCmsEditorialRounds.filter(row => row.taskId === task.id).sort((a, b) => b.roundNo - a.roundNo), observations: mockCmsEditorialObservations.filter(row => row.taskId === task.id).sort((a, b) => b.id - a.id), history: mockCmsEditorialHistory.filter(row => row.taskId === task.id) };
}

/** Demo reports expose illustrative counters, never a verified collection coverage interval. */
export function mockEditorialMetrics(task: Pick<CmsEditorialTask, 'siteId' | 'contentId' | 'source' | 'sourceKeyword'>, window: CmsEditorialMetricSnapshot['window']): CmsEditorialMetricSnapshot {
  const metrics = cmsStatMetricsSchema.parse(Object.fromEntries(Object.keys(cmsStatMetricsSchema.shape).map(key => [key, 0])));
  const query = cmsStatContract.report.query.parse({ siteId: task.siteId, startTime: dayjs(window.startTime).tz(window.timeZone).format('YYYY-MM-DD HH:mm:ss'), endTime: dayjs(window.endTime).tz(window.timeZone).format('YYYY-MM-DD HH:mm:ss'), watermark: window.watermark, timeZone: window.timeZone, compare: 'none', dimension: task.source === 'search' ? 'search' : 'content', ...(task.source !== 'search' && task.contentId ? { contentId: task.contentId } : {}) });
  const rows = getMockCmsStatsReportRows(query);
  const match = task.source === 'search' ? rows.find(row => normalizeCmsSearchKeyword(row.key) === normalizeCmsSearchKeyword(task.sourceKeyword ?? '')) : rows.find(row => Number(row.key) === task.contentId);
  if (match) for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) metrics[key] = match[key];
  return { window: structuredClone(window), metrics, coverage: { available: false, reason: 'unknown' } };
}

type ActivationInput = { siteId: number; releaseId: number; deploymentId: number; activationId: number; activatedAt: string; revisions: ReadonlyMap<number, number> };
function bindActivation(task: CmsEditorialTask, round: CmsEditorialTaskRound, activation: Omit<ActivationInput, 'siteId' | 'revisions'>) {
  Object.assign(round, { releaseId: activation.releaseId, deploymentId: activation.deploymentId, activationId: activation.activationId, activatedAt: activation.activatedAt });
  for (const windowDays of [7, 30] as const) {
    if (mockCmsEditorialObservations.some(row => row.roundId === round.id && row.windowDays === windowDays)) continue;
    const dueAt = new Date(activation.activatedAt).getTime() + windowDays * DAY_MS;
    mockCmsEditorialObservations.push({ id: nextIdFrom(mockCmsEditorialObservations), taskId: task.id, roundId: round.id, windowDays, dueAt: mockDateTime(dueAt), settlesAt: mockDateTime(dueAt + SETTLEMENT_MS), outcome: 'pending', before: null, after: null, otherActivationIds: [], computedAt: null });
  }
  task.status = 'online'; task.version += 1;
  appendMockEditorialHistory(task, 'activated', null, { revisionId: round.solutionRevisionId, ...activation }, true);
}
export function recordMockEditorialActivation(input: ActivationInput) {
  for (const task of mockCmsEditorialTasks.filter(row => row.siteId === input.siteId && ['edit_done', 'online', 'observing', 'verified'].includes(row.status))) {
    const round = currentRound(task);
    if (!round.solutionRevisionId || round.closedAt) continue;
    const revisionId = task.contentId ? input.revisions.get(task.contentId) : undefined;
    const matches = revisionId === round.solutionRevisionId && getMockCmsRevision(revisionId)?.hash === round.solutionHash;
    if (!round.activatedAt && task.status === 'edit_done' && matches) bindActivation(task, round, input);
    else if (round.activatedAt && !matches && !round.interruptedAt) {
      round.interruptedAt = input.activatedAt; round.interruptionReason = '实际在线修订已被替换、撤下或回滚';
      for (const observation of mockCmsEditorialObservations.filter(row => row.roundId === round.id && row.outcome === 'pending')) { observation.outcome = 'interrupted'; observation.computedAt = mockDateTime(); }
      task.status = task.status === 'verified' ? 'verified' : 'observing'; task.version += 1;
      appendMockEditorialHistory(task, 'interrupted', '解决修订已不再在线；本轮证据保留，继续处理请重开事项', { activationId: input.activationId, revisionId: revisionId ?? null }, true);
    }
  }
}
export function completeMockEditorialTask(task: CmsEditorialTask, input: BodyOf<typeof cmsOperationsContract.completeTask>) {
  assertMockEditorialVersion(task, input.expectedVersion);
  if (task.source === 'search' && input.goal.metric !== 'no_result_rate') invalid('无结果搜索事项必须以降低无结果率验证，不能改为人工核验');
  if (task.source !== 'search' && input.goal.metric === 'no_result_rate') invalid('无结果率目标需要无结果搜索词来源');
  if (!['open', 'in_progress'].includes(task.status) || !task.contentId) reject('请先关联稿件；只有处理中事项可以完成编辑');
  const content = getMockCmsWorkingContent(task.contentId!);
  const revision = getMockCmsRevision(input.revisionId);
  if (!revision || revision.contentId !== content.id || content.siteId !== task.siteId || (content.approvedRevisionId !== revision.id && content.publishedRevisionId !== revision.id)) invalid('解决修订必须是本站关联稿件的已审核修订');
  if (!mockCmsRevisionResourcesVisible(revision!.snapshot)) invalid('解决修订的素材已撤权或到期，不能完成编辑');
  const round = currentRound(task);
  const publication = getMockCmsActivePublication(content.id);
  if (publication?.revisionId === revision!.id && publication.activatedAt < round.createdAt && input.goal.metric !== 'manual') reject('该修订在本轮开始前已上线，请绑定本轮解决问题的新修订');
  Object.assign(round, { goal: structuredClone(input.goal), solutionRevisionId: revision!.id, solutionHash: revision!.hash });
  task.status = 'edit_done'; task.version += 1;
  appendMockEditorialHistory(task, 'edit_completed', input.note, { revisionId: revision!.id, revisionHash: revision!.hash, goal: input.goal });
  if (publication?.revisionId === revision!.id) bindActivation(task, round, publication);
}
function refreshObservation(task: CmsEditorialTask, round: CmsEditorialTaskRound, observation: CmsEditorialTaskDetail['observations'][number], history = true) {
  if (!round.activatedAt || !round.goal) return;
  const now = Date.now(); const start = new Date(round.activatedAt).getTime();
  if (now <= start) return;
  const end = Math.min(new Date(observation.dueAt).getTime(), now);
  const timeZone = round.sourceEvidence.snapshot?.window.timeZone ?? 'Asia/Shanghai';
  const watermark = new Date(now).toISOString();
  observation.before = mockEditorialMetrics(task, { startTime: new Date(start - (end - start)).toISOString(), endTime: new Date(start).toISOString(), watermark, timeZone });
  observation.after = mockEditorialMetrics(task, { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), watermark, timeZone });
  const publication = task.contentId ? getMockCmsActivePublication(task.contentId) : null;
  const revision = round.solutionRevisionId ? getMockCmsRevision(round.solutionRevisionId) : undefined;
  observation.outcome = assessCmsEditorialOutcome({ goal: round.goal, before: observation.before, after: observation.after, windowComplete: now >= new Date(observation.settlesAt).getTime(), interrupted: !!round.interruptedAt || publication?.revisionId !== round.solutionRevisionId || publication?.hash !== round.solutionHash || !revision || !mockCmsRevisionResourcesVisible(revision.snapshot) });
  observation.otherActivationIds = getMockCmsSiteActivations(task.siteId).filter(row => new Date(row.createdAt).getTime() > start && new Date(row.createdAt).getTime() < end).map(row => row.id);
  observation.computedAt = mockDateTime();
  if (history) appendMockEditorialHistory(task, 'observation', null, { observationId: observation.id, windowDays: observation.windowDays, outcome: observation.outcome, before: observation.before, after: observation.after, otherActivationIds: observation.otherActivationIds }, true);
}
export function refreshMockEditorialObservations(task: CmsEditorialTask, input: BodyOf<typeof cmsOperationsContract.refreshTaskObservations>) {
  assertMockEditorialVersion(task, input.expectedVersion);
  const round = currentRound(task);
  if (!round.activatedAt || round.closedAt) reject('本轮尚未上线或已结束，不能刷新观察结果');
  if (task.status === 'online') task.status = 'observing';
  task.version += 1;
  for (const observation of mockCmsEditorialObservations.filter(row => row.roundId === round.id)) refreshObservation(task, round, observation);
}
export function verifyMockEditorialTask(task: CmsEditorialTask, input: BodyOf<typeof cmsOperationsContract.verifyTask>) {
  assertMockEditorialVersion(task, input.expectedVersion);
  const round = currentRound(task);
  if (!['online', 'observing'].includes(task.status) || !round.activatedAt || round.interruptedAt || !round.goal) reject('只有解决修订持续在线且观察有效的事项可以验证');
  const publication = task.contentId ? getMockCmsActivePublication(task.contentId) : null;
  const revision = round.solutionRevisionId ? getMockCmsRevision(round.solutionRevisionId) : undefined;
  if (publication?.revisionId !== round.solutionRevisionId || publication?.hash !== round.solutionHash || !revision || !mockCmsRevisionResourcesVisible(revision.snapshot)) reject('解决修订已撤下、替换或素材不可访问，不能验证');
  if (round.goal!.metric !== 'manual') {
    const observation = mockCmsEditorialObservations.find(row => row.id === input.observationId && row.roundId === round.id);
    if (!observation || observation.windowDays !== 30 || Date.now() < new Date(observation.settlesAt).getTime()) reject('须等待30天观察及迟到结算窗口完整结束');
    // Never trust a stale or externally changed demo verdict; derive it again from the report source.
    const recomputed = structuredClone(observation!);
    refreshObservation(task, round, recomputed, false);
    if (recomputed.outcome !== 'improved') reject('样本、采集覆盖或改善目标不满足，不能标记有效改善');
    Object.assign(observation!, recomputed);
  }
  round.verifiedAt = mockDateTime(); task.status = 'verified'; task.version += 1;
  appendMockEditorialHistory(task, 'verified', input.note, { observationId: input.observationId, verification: round.goal!.metric === 'manual' ? '人工核验通过，不推断指标改善' : '指标达到预设目标，不作单一因果结论' });
}
export function reopenMockEditorialTask(task: CmsEditorialTask, input: BodyOf<typeof cmsOperationsContract.reopenTask>) {
  assertMockEditorialVersion(task, input.expectedVersion);
  const round = currentRound(task); round.closedAt = mockDateTime();
  task.roundNo += 1; task.status = 'open'; task.version += 1;
  const evidence = { ...round.sourceEvidence, capturedAt: new Date().toISOString(), summary: input.reason, snapshot: null, metadata: { ...round.sourceEvidence.metadata, previousRound: round.roundNo, reopenReason: input.reason } };
  createMockEditorialRound(task, evidence);
  appendMockEditorialHistory(task, 'reopened', input.reason, { previousRound: round.roundNo, sourceEvidence: evidence });
}
export function closeMockEditorialRound(task: CmsEditorialTask) { currentRound(task).closedAt = mockDateTime(); }
export function resetMockEditorialOutcomes() { mockCmsEditorialRounds.length = 0; mockCmsEditorialObservations.length = 0; mockCmsEditorialHistory.length = 0; }
