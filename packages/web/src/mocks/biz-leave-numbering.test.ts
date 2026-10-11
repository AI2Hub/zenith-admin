import { beforeEach, describe, expect, it } from 'vitest';
import { bizLeaveContract } from '@zenith/shared/biz';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { urlOf } from '@/lib/contract-query';
import { mockBizLeaves } from './data/biz-leave';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from './data/numbering';
import { mockWorkflowInstances } from './data/workflow';
import { bizLeaveHandlers } from './handlers/biz-leave';
import { mockAccessToken } from './utils/auth';

const leaves = structuredClone(mockBizLeaves);
const createBody = { leaveType: 'annual', startDate: '2026-10-12', endDate: '2026-10-13', days: 2, reason: '编号接入验证' };

async function call(method: string, url: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${url}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mockAccessToken('admin')}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const handler of bizLeaveHandlers) {
    const result = await handler.run({ request, requestId: crypto.randomUUID() });
    if (result?.response) return { status: result.response.status, ...(await result.response.json()) };
  }
  throw new Error('Missing leave handler');
}

beforeEach(() => {
  mockBizLeaves.splice(0, mockBizLeaves.length, ...structuredClone(leaves));
  mockNumberingRules.splice(0, mockNumberingRules.length, ...structuredClone(SEED_NUMBERING_RULES));
  mockNumberingVersions.splice(0, mockNumberingVersions.length, ...structuredClone(SEED_NUMBERING_VERSIONS));
  mockNumberingBindings.splice(0, mockNumberingBindings.length, ...structuredClone(SEED_NUMBERING_BINDINGS));
  mockNumberingCounters.length = 0; mockNumberingAllocations.length = 0;
});

describe('请假业务编号接入', () => {
  it('creates an authoritative number, links the receipt, and supports searching by the number', async () => {
    const result = await call('POST', urlOf(bizLeaveContract.create), { ...createBody, leaveNo: 'CLIENT-FORGED' });
    expect(result.status).toBe(200);
    expect(result.data.leaveNo).toMatch(/^QJ\d{14}$/);
    expect(mockNumberingAllocations).toHaveLength(1);
    expect(mockNumberingAllocations[0]).toMatchObject({ scene: 'biz.leave', number: result.data.leaveNo, businessKey: String(result.data.id) });
    const list = await call('GET', urlOf(bizLeaveContract.list, { query: { keyword: result.data.leaveNo } }));
    expect(list.data.total).toBeGreaterThan(0);
    expect(list.data.list.map((item: { id: number }) => item.id)).toContain(result.data.id);
    expect(list.data.list.every((item: { leaveNo: string }) => item.leaveNo === result.data.leaveNo)).toBe(true);
  });

  it('keeps the business number through editing and a new approval round', async () => {
    const { data } = await call('POST', urlOf(bizLeaveContract.create), createBody);
    const edited = await call('PUT', urlOf(bizLeaveContract.update, { params: { id: data.id } }), { reason: '修改事由' });
    expect(edited.data.leaveNo).toBe(data.leaveNo);
    const stored = mockBizLeaves.find(leave => leave.id === data.id)!;
    stored.status = 'rejected';
    const reopened = await call('POST', urlOf(bizLeaveContract.reopen, { params: { id: data.id } }));
    expect(reopened.data.leaveNo).toBe(data.leaveNo);
    const submitted = await call('POST', urlOf(bizLeaveContract.submit, { params: { id: data.id } }));
    expect(submitted.data.leaveNo).toBe(data.leaveNo);
    expect(submitted.data.workflowInstanceId).not.toBeNull();
    const instance = mockWorkflowInstances.find(item => item.id === submitted.data.workflowInstanceId)!;
    expect(instance.serialNo).toBeTruthy();
    expect(instance.serialNo).not.toBe(data.leaveNo);
    expect(mockNumberingAllocations.filter(item => item.scene === 'biz.leave')).toHaveLength(1);
  });

  it('does not save a business row or consume a sequence when allocation fails', async () => {
    mockNumberingRules.find(rule => rule.scene === 'biz.leave')!.status = 'disabled';
    const count = mockBizLeaves.length;
    const result = await call('POST', urlOf(bizLeaveContract.create), createBody);
    expect(result.status).toBe(409);
    expect(mockBizLeaves).toHaveLength(count);
    expect(mockNumberingAllocations).toHaveLength(0);
    expect(mockNumberingCounters).toHaveLength(0);
  });
});
