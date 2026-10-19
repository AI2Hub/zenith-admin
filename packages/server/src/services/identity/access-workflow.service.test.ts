import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../../db/types';

const mocks = vi.hoisted(() => ({ overlap: vi.fn(), enqueue: vi.fn() }));
vi.mock('../../db', () => ({ db: {} }));
vi.mock('./access-governance.service', () => ({ assertNoOverlappingAccessRequest: mocks.overlap }));
vi.mock('../../lib/workflow-jobs/engine', () => ({ enqueueJob: mocks.enqueue }));

import { identityAccessRequests, identityAccessRequestItems, workflowInstances } from '../../db/schema';
import { attachAccessRequestToWorkflow, bridgeAccessWorkflowOutcome } from './access-workflow.service';

function executor(options: { existing?: { id: number }; status?: string } = {}) {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const itemValues = vi.fn().mockResolvedValue(undefined);
  const requestValues = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 77 }]) }));
  const limit = vi.fn().mockResolvedValue(options.status ? [{ status: options.status, approvedAt: null }] : []);
  const lock = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ for: lock }));
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    query: { identityAccessRequests: { findFirst: vi.fn().mockResolvedValue(options.existing) } },
    insert: vi.fn((table) => ({ values: table === identityAccessRequests ? requestValues : itemValues })),
    update: vi.fn(() => ({ set })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
  };
  return { tx: tx as unknown as DbExecutor, raw: tx, requestValues, itemValues, set, updateWhere, lock };
}

const instance = {
  id: 41, tenantId: 3, initiatorId: 9,
  formData: {
    targetUserId: 9, requestType: 'temporary', reason: '部署工单需要查询用户', startsAt: '2026-10-19 10:00:00', expiresAt: '2026-10-19 11:00:00', riskLevel: 'low',
    permissionItems: [{ itemType: 'menu', roleId: null, menuId: 1011, permissionCode: 'system:user:list', permissionLabel: '查询用户', dataScope: 'self', deptScopeIds: [], snapshot: {} }],
  },
};
const outcome = { id: 41, tenantId: 3, bizType: 'identity.access_request', bizId: '77', status: 'approved' };

beforeEach(() => { vi.clearAllMocks(); mocks.overlap.mockResolvedValue(undefined); mocks.enqueue.mockResolvedValue({ id: 88 }); });

describe('atomic access request workflow attachment', () => {
  it('reserves permissions and persists the request, items and stable workflow key using the caller transaction', async () => {
    const e = executor();
    await attachAccessRequestToWorkflow(e.tx, instance);
    expect(mocks.overlap).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 9, tenantId: 3 }), e.tx);
    expect(e.raw.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.overlap.mock.invocationCallOrder[0]);
    expect(e.requestValues).toHaveBeenCalledWith(expect.objectContaining({ applicantUserId: 9, targetUserId: 9, workflowInstanceId: 41, status: 'pending' }));
    expect(e.raw.insert).toHaveBeenCalledWith(identityAccessRequestItems);
    expect(e.itemValues).toHaveBeenCalledWith([expect.objectContaining({ requestId: 77, menuId: 1011, dataScope: 'self' })]);
    expect(e.raw.update).toHaveBeenCalledWith(workflowInstances);
    expect(e.set).toHaveBeenCalledWith({ bizType: 'identity.access_request', bizId: '77' });
  });

  it('rejects conflicting permission reservations before inserting business data', async () => {
    const e = executor();
    mocks.overlap.mockRejectedValue(new Error('overlap'));
    await expect(attachAccessRequestToWorkflow(e.tx, instance)).rejects.toThrow('overlap');
    expect(e.raw.insert).not.toHaveBeenCalled();
  });

  it('does not accept client-controlled recipients or missing authoritative permission items', async () => {
    const e = executor();
    await expect(attachAccessRequestToWorkflow(e.tx, { ...instance, formData: { ...instance.formData, targetUserId: 10 } })).rejects.toMatchObject({ status: 409 });
    await expect(attachAccessRequestToWorkflow(e.tx, { ...instance, formData: {} })).rejects.toMatchObject({ status: 409 });
    expect(e.raw.insert).not.toHaveBeenCalled();
  });

  it('does not create another business request for the same submitted workflow', async () => {
    const e = executor({ existing: { id: 77 } });
    await expect(attachAccessRequestToWorkflow(e.tx, instance)).rejects.toMatchObject({ status: 409 });
    expect(e.raw.insert).not.toHaveBeenCalled();
  });
});

describe('transactional access workflow outcome', () => {
  it('locks the business request and durably schedules idempotent grant issuance on approval', async () => {
    const e = executor({ status: 'pending' });
    await bridgeAccessWorkflowOutcome(e.tx, outcome, 12);
    expect(e.lock).toHaveBeenCalledWith('update');
    expect(e.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', failureReason: null }));
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'access_grant_apply', instanceId: 41, tenantId: 3, payload: { requestId: 77, approvedBy: 12 }, idempotencyKey: 'identity-access-apply:77', maxAttempts: 5 }), e.tx);
  });

  it.each(['rejected', 'withdrawn', 'cancelled'])('writes %s to the business request without issuing privileges', async (status) => {
    const e = executor({ status: 'pending' });
    await bridgeAccessWorkflowOutcome(e.tx, { ...outcome, status }, 12);
    expect(e.set).toHaveBeenCalledWith(expect.objectContaining({ status: status === 'rejected' ? 'rejected' : 'cancelled' }));
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('does not regress an already applied or failed request on duplicate outcomes', async () => {
    for (const status of ['applied', 'failed']) {
      const e = executor({ status });
      await bridgeAccessWorkflowOutcome(e.tx, outcome, 12);
      expect(e.set).not.toHaveBeenCalled();
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('ignores other domains but rejects broken access-domain business links', async () => {
    const e = executor();
    await bridgeAccessWorkflowOutcome(e.tx, { ...outcome, bizType: 'biz_leave' }, 12);
    expect(e.raw.select).not.toHaveBeenCalled();
    await expect(bridgeAccessWorkflowOutcome(e.tx, { ...outcome, bizId: 'invalid' }, 12)).rejects.toThrow('业务申请关联');
    await expect(bridgeAccessWorkflowOutcome(e.tx, outcome, 12)).rejects.toThrow('申请不存在');
  });
});
