import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: vi.fn(), definitions: vi.fn(), detail: vi.fn(), businessDetail: vi.fn(), visible: vi.fn(), scope: vi.fn(), preview: vi.fn(),
}));
vi.mock('../../db', () => ({ db: { select: () => ({ from: () => ({
  where: () => ({ limit: mocks.definitions }),
  leftJoin: () => ({ where: () => ({ orderBy: mocks.rows }) }),
}) }) } }));
vi.mock('../../lib/context', () => ({ currentUser: () => ({ userId: 7, username: 'editor', tenantId: 1, roles: [] }) }));
vi.mock('./instances/queries', () => ({ getInstanceDetail: mocks.detail, getBusinessInstanceDetail: mocks.businessDetail }));
vi.mock('./instances/shared', () => ({ requireVisibleInstance: mocks.visible }));
vi.mock('./workflow-launch-access', () => ({ assertWorkflowInitiatorScope: mocks.scope }));
vi.mock('./workflow-preview.service', () => ({ previewFlowData: mocks.preview }));

import { getBusinessWorkflowContext, previewBusinessWorkflow, requireBusinessApprovalInstance } from './workflow-business-context.service';

const rounds = [
  { id: 9, title: '再次申请', status: 'running', createdAt: new Date('2026-09-15T01:00:00Z'), definitionName: '请假审批' },
  { id: 3, title: '上次申请', status: 'rejected', createdAt: new Date('2026-09-14T01:00:00Z'), definitionName: '请假审批' },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue(rounds);
  mocks.businessDetail.mockImplementation(async (id) => ({ id }));
  mocks.detail.mockResolvedValue({ id: 3 });
  mocks.visible.mockResolvedValue({ id: 3, bizType: 'biz_leave', bizId: '10' });
  mocks.scope.mockResolvedValue(undefined);
  mocks.preview.mockResolvedValue([]);
});

describe('business workflow round context', () => {
  it('reopened draft shows no current chain while retaining all rounds', async () => {
    const result = await getBusinessWorkflowContext('biz_leave', '10', null);
    expect(result.instance).toBeNull();
    expect(result.previousInstances.map((r) => r.id)).toEqual([9, 3]);
    expect(mocks.businessDetail).not.toHaveBeenCalled();
  });
  it('selects an explicit old round without changing the stable round list', async () => {
    const result = await getBusinessWorkflowContext('biz_leave', '10', 9, 3);
    expect(result.instance).toEqual({ id: 3 });
    expect(result.previousInstances.map((r) => r.id)).toEqual([9, 3]);
    expect(mocks.businessDetail).toHaveBeenCalledWith(3, 'biz_leave', '10');
  });
  it('CMS defaults to the latest round outside draft/rejected', async () => {
    await getBusinessWorkflowContext('cms_content', '10', 'latest');
    expect(mocks.businessDetail).toHaveBeenCalledWith(9, 'cms_content', '10');
  });
  it('rejects a selected instance outside the authorized business record', async () => {
    await expect(getBusinessWorkflowContext('biz_leave', '10', 9, 888)).rejects.toThrow('不属于');
    expect(mocks.businessDetail).not.toHaveBeenCalled();
  });
  it('authorizes old-round approval data by that exact instance', async () => {
    await requireBusinessApprovalInstance(3, 'biz_leave', '10');
    expect(mocks.visible).toHaveBeenCalledWith(3);
    expect(mocks.detail).toHaveBeenCalledWith(3);
  });
  it('rejects wrong business bindings before loading participant data', async () => {
    await expect(requireBusinessApprovalInstance(3, 'cms_content', '10')).rejects.toThrow('不属于');
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it('preserves normal workflow participant denial', async () => {
    mocks.detail.mockRejectedValueOnce(new Error('无权查看'));
    await expect(requireBusinessApprovalInstance(3, 'biz_leave', '10')).rejects.toThrow('无权查看');
  });
});

describe('business preview', () => {
  it('denies unavailable definitions instead of treating the business as non-workflow', async () => {
    mocks.definitions.mockResolvedValueOnce([]);
    await expect(previewBusinessWorkflow(6, {})).rejects.toThrow('未发布');
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('shares routing input and launch scope and strips graph secrets without mutating source', async () => {
    const flow = { nodes: [{ id: 'start', data: { type: 'start', key: 'start', label: '发起' } },
      { id: 'approval', data: { type: 'approve', key: 'approval', label: '审批', externalApproval: { enabled: true, secret: 'secret' } } }], edges: [] };
    const def = { id: 6, name: '请假审批', description: null, version: 2, flowData: flow };
    mocks.definitions.mockResolvedValueOnce([def]);
    const variables = { days: 2, leaveType: 'annual' };
    const result = await previewBusinessWorkflow(6, variables);
    expect(mocks.scope).toHaveBeenCalledWith(def);
    expect(mocks.preview).toHaveBeenCalledWith(flow, variables);
    expect(result.definition?.flowData?.nodes[1].data.externalApproval?.secret).toBe('');
    expect(flow.nodes[1].data.externalApproval?.secret).toBe('secret');
  });
  it('does not preview users outside the same launch scope', async () => {
    mocks.definitions.mockResolvedValueOnce([{ id: 6 }]);
    mocks.scope.mockRejectedValueOnce(new Error('当前流程不在你的可发起范围内'));
    await expect(previewBusinessWorkflow(6, {})).rejects.toThrow('可发起范围');
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
