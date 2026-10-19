import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowJobContext, WorkflowJobHandler } from '../types';

const mocks = vi.hoisted(() => ({ handler: undefined as WorkflowJobHandler | undefined, apply: vi.fn(), set: vi.fn(), where: vi.fn() }));
vi.mock('../registry', () => ({ registerJobHandler: (_type: string, handler: WorkflowJobHandler) => { mocks.handler = handler; }, registerJobSettlementHandler: vi.fn() }));
vi.mock('../../../services/identity/access-governance.service', () => ({ applyApprovedAccessRequest: mocks.apply }));
vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../lease', () => ({ workflowTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ update: () => ({ set: mocks.set }) }) }));
import './access-grant-apply';

const context = { payload: { requestId: 77, approvedBy: 12 }, job: { id: 88, instanceId: 41, tenantId: 3 } } as unknown as WorkflowJobContext;
beforeEach(() => { vi.clearAllMocks(); mocks.set.mockReturnValue({ where: mocks.where }); mocks.where.mockResolvedValue(undefined); });

describe('durable access grant issuance', () => {
  it('supplies the trusted tenant, workflow and approval identity to the domain service', async () => {
    mocks.apply.mockResolvedValue({ id: 91 });
    await expect(mocks.handler!(context)).resolves.toEqual({ result: { requestId: 77, grantId: 91 } });
    expect(mocks.apply).toHaveBeenCalledWith(77, { workflowInstanceId: 41, tenantId: 3, approvedBy: 12 });
  });

  it('records an actionable failure and rethrows so the worker retries instead of reporting success', async () => {
    mocks.apply.mockRejectedValue(new Error('issuance unavailable'));
    await expect(mocks.handler!(context)).rejects.toThrow('issuance unavailable');
    expect(mocks.set).toHaveBeenCalledWith({ provisionStatus: 'failed', failureReason: 'issuance unavailable' });
  });

  it('rejects malformed durable payloads before any privilege change', async () => {
    await expect(mocks.handler!({ ...context, payload: { requestId: -1 } })).rejects.toThrow('有效申请关联');
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
