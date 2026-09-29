import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsEditorialTaskDetailSchema, type CmsEditorialTask, type CmsEditorialTaskDetail } from '@zenith/shared/cms';
import { mockCmsContents, mockCmsContentVersions } from './data/cms';
import { mockCmsEditorialTasks } from './data/cms-operations';
import { cmsOperationsHandlers } from './handlers/cms-operations';
import { getMockCmsActivePublication, resetMockCmsReleases, submitMockCmsContentRelease, submitMockCmsWithdrawal } from './handlers/cms-releases';
import { freezeMockCmsRevision, getMockCmsWorkingContent, resetMockCmsRevisions, saveMockCmsWorkingContent } from './utils/cms-revisions';
import { resetMockEditorialOutcomes } from './utils/cms-editorial-outcomes';

const initial = { contents: structuredClone(mockCmsContents), revisions: structuredClone(mockCmsContentVersions) };
const goal = { metric: 'manual' as const, minSample: 30, targetValue: 0, description: '人工核实内容已经解决问题' };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-29T04:00:00Z')); });
afterEach(() => {
  resetMockCmsReleases(); resetMockCmsRevisions(); resetMockEditorialOutcomes(); mockCmsEditorialTasks.length = 0;
  mockCmsContents.splice(0, mockCmsContents.length, ...structuredClone(initial.contents));
  mockCmsContentVersions.splice(0, mockCmsContentVersions.length, ...structuredClone(initial.revisions));
  vi.useRealTimers();
});
async function call<T>(method: string, path: string, body?: unknown) {
  for (const handler of cmsOperationsHandlers) {
    const request = new Request(`${window.location.origin}/api/cms/operations${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `outcomes-${Math.random()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No operation handler for ${path}`);
}
function article() { return getMockCmsWorkingContent(mockCmsContents.find(row => row.status === 'published')!.id); }
async function newTask(source: 'manual' | 'search' = 'manual') {
  const content = article();
  const result = await call<CmsEditorialTask>('POST', '/tasks', { siteId: content.siteId, title: '解决文化检索问题', contentId: content.id, source, ...(source === 'search' ? { sourceKeyword: '文化选题 1' } : {}) });
  expect(result.status).toBe(200);
  return result.data;
}
async function publish(contentId: number, revisionId: number) {
  submitMockCmsContentRelease(contentId, revisionId);
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(getMockCmsActivePublication(contentId)?.revisionId).toBe(revisionId);
}

describe('CMS Demo editorial outcome lifecycle', () => {
  it('binds an approved revision, waits for actual release activation and preserves prior rounds', async () => {
    const created = await newTask(); const content = article();
    const completed = await call<CmsEditorialTaskDetail>('POST', `/tasks/${created.id}/complete`, { expectedVersion: 1, revisionId: content.approvedRevisionId, goal, note: '完成内容编辑' });
    expect(completed.data.status).toBe('edit_done');
    expect(completed.data.observations).toHaveLength(0);
    expect((await call('POST', `/tasks/${created.id}/verify`, { expectedVersion: completed.data.version, observationId: null, note: '误将草稿完成当作已解决' })).status).toBe(409);
    await publish(content.id, content.approvedRevisionId!);
    const online = await call<CmsEditorialTaskDetail>('GET', `/tasks/${created.id}`);
    expect(cmsEditorialTaskDetailSchema.safeParse(online.data).success).toBe(true);
    expect(online.data.status).toBe('online');
    expect(online.data.observations.map(row => row.windowDays).sort((a, b) => a - b)).toEqual([7, 30]);
    expect(online.data.rounds[0]).toMatchObject({ solutionRevisionId: content.approvedRevisionId, deploymentId: getMockCmsActivePublication(content.id)!.deploymentId });
    expect((await call('POST', `/tasks/${created.id}/verify`, { expectedVersion: 1, observationId: null, note: '陈旧版本' })).status).toBe(409);
    const verified = await call<CmsEditorialTaskDetail>('POST', `/tasks/${created.id}/verify`, { expectedVersion: online.data.version, observationId: null, note: '已在在线修订核对，人工验证通过' });
    expect(verified.data.status).toBe('verified');
    const oldRound = structuredClone(verified.data.rounds[0]);
    const reopened = await call<CmsEditorialTaskDetail>('POST', `/tasks/${created.id}/reopen`, { expectedVersion: verified.data.version, reason: '读者反馈了新的疑问' });
    expect(reopened.data).toMatchObject({ status: 'open', roundNo: 2 });
    expect(reopened.data.rounds).toHaveLength(2);
    expect(reopened.data.rounds[1]).toMatchObject({ id: oldRound.id, solutionRevisionId: oldRound.solutionRevisionId, verifiedAt: oldRound.verifiedAt });
    expect(reopened.data.rounds[1].closedAt).not.toBeNull();
    expect(reopened.data.rounds[0].solutionRevisionId).toBeNull();
  });

  it('rejects arbitrary draft revisions and prevents search sources from bypassing evidence with manual goals', async () => {
    const created = await newTask('search'); const content = article();
    expect((await call('POST', `/tasks/${created.id}/complete`, { expectedVersion: 1, revisionId: content.approvedRevisionId, goal, note: '企图改人工核验' })).status).toBe(400);
    saveMockCmsWorkingContent(content.id, { title: `${content.title}（工作稿）` }, content.version, 'autosave');
    const unapproved = freezeMockCmsRevision(content.id);
    const searchGoal = { ...goal, metric: 'no_result_rate', targetValue: 10 };
    expect((await call('POST', `/tasks/${created.id}/complete`, { expectedVersion: 1, revisionId: unapproved.id, goal: searchGoal, note: '未审核工作稿' })).status).toBe(400);
    expect((await call<CmsEditorialTaskDetail>('GET', `/tasks/${created.id}`)).data).toMatchObject({ status: 'open', version: 1 });
  });

  it('rejects seven-day verification and never turns illustrative demo counters into successful improvement', async () => {
    const created = await newTask('search'); const content = article();
    await call('POST', `/tasks/${created.id}/complete`, { expectedVersion: 1, revisionId: content.approvedRevisionId, goal: { ...goal, metric: 'no_result_rate', targetValue: 10 }, note: '补全专题指引' });
    await publish(content.id, content.approvedRevisionId!);
    let detail = (await call<CmsEditorialTaskDetail>('GET', `/tasks/${created.id}`)).data;
    vi.setSystemTime(new Date('2026-10-08T04:00:00Z'));
    const week = detail.observations.find(row => row.windowDays === 7)!;
    expect((await call('POST', `/tasks/${created.id}/verify`, { expectedVersion: detail.version, observationId: week.id, note: '七天不代替三十天验证' })).status).toBe(409);
    detail = (await call<CmsEditorialTaskDetail>('POST', `/tasks/${created.id}/observations/refresh`, { expectedVersion: detail.version })).data;
    const ongoing = detail.observations.find(row => row.windowDays === 30)!;
    expect(Date.parse(ongoing.before!.window.endTime) - Date.parse(ongoing.before!.window.startTime)).toBe(Date.parse(ongoing.after!.window.endTime) - Date.parse(ongoing.after!.window.startTime));
    vi.setSystemTime(new Date('2026-11-01T04:00:00Z'));
    detail = (await call<CmsEditorialTaskDetail>('POST', `/tasks/${created.id}/observations/refresh`, { expectedVersion: detail.version })).data;
    expect(detail.status).toBe('observing');
    const month = detail.observations.find(row => row.windowDays === 30)!;
    expect(month.outcome).toBe('incomplete_coverage');
    expect((await call('POST', `/tasks/${created.id}/verify`, { expectedVersion: detail.version, observationId: month.id, note: '不能凭演示数据宣布改善' })).status).toBe(409);
  });

  it('interrupts an observation when the actual release withdraws its solution', async () => {
    const created = await newTask(); const content = article();
    await call('POST', `/tasks/${created.id}/complete`, { expectedVersion: 1, revisionId: content.approvedRevisionId, goal, note: '待上线' });
    await publish(content.id, content.approvedRevisionId!);
    submitMockCmsWithdrawal(content.id); await new Promise(resolve => setTimeout(resolve, 300));
    const detail = (await call<CmsEditorialTaskDetail>('GET', `/tasks/${created.id}`)).data;
    expect(detail.status).toBe('observing');
    expect(detail.rounds[0].interruptedAt).not.toBeNull();
    expect(detail.observations.every(row => row.outcome === 'interrupted')).toBe(true);
    expect((await call('POST', `/tasks/${created.id}/verify`, { expectedVersion: detail.version, observationId: null, note: '撤下后不能验证' })).status).toBe(409);
  });
});
