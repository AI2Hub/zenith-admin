import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowNodeActivation, WorkflowTask, WorkflowTaskConsult } from '@zenith/shared/workflow';
import { WorkflowApprovalGroupsPanel } from './WorkflowApprovalGroupsPanel';

const mutation = vi.hoisted(() => ({ reduce: vi.fn().mockResolvedValue({ instance: { id: 9 } }) }));
vi.mock('@/hooks/queries/workflow-tasks', () => ({ useReduceWorkflowSignGroup: () => ({ mutateAsync: mutation.reduce, isPending: false }) }));

const base = { id: 11, activationId: 'round-one', origin: 'base' as const, groupId: null, originalAssigneeId: 1,
  currentAssigneeId: 1, assigneeName: '张主管', status: 'approved' as const, order: null, mandatory: true, currentTaskId: 101 };
const added = { id: 12, activationId: 'round-one', origin: 'addSign' as const, groupId: 20, originalAssigneeId: 2,
  currentAssigneeId: 2, assigneeName: '赵法务', status: 'pending' as const, order: null, mandatory: false, currentTaskId: 102 };
const activation: WorkflowNodeActivation = { id: 'round-one', nodeKey: 'review', nodeName: '合同审核', tokenId: 1,
  status: 'active', approveMethod: 'or', approveRatio: null, baseTotal: 1, baseRequired: 1, baseApproved: 1, baseRejected: 0,
  baseSatisfied: true, slots: [base, added], signGroups: [{ id: 20, activationId: 'round-one', anchorSlotId: 11,
    position: 'after', signMode: 'and', status: 'active', createdBy: 1, createdAt: '2026-10-02 08:00:00', canReduce: true, slots: [added] }],
};

describe('supplemental approval group controls', () => {
  it('allows the group owner to reduce after the original task has already been approved', async () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} />);
    expect(screen.getByText('基础意见 1/1，需 1 票')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '减签' }));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '赵法务' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm' })); });
    await waitFor(() => expect(mutation.reduce).toHaveBeenCalledWith(expect.objectContaining({
      params: { groupId: 20 }, body: expect.objectContaining({ targetSlotIds: [12] }),
    })));
  });

  it('keeps business read-only contexts free of mutation entry points', () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} allowActions={false} />);
    expect(screen.getByText('后加签')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '减签' })).not.toBeInTheDocument();
  });
});

describe('consult entries', () => {
  const task: WorkflowTask = {
    id: 101, instanceId: 9, nodeKey: 'review', nodeName: '合同审核', nodeType: 'approve',
    activationId: 'round-one', slotId: 11, taskKind: 'approval', waitReason: null,
    activatedAt: '2026-10-02 08:00:00', signPosition: null, assigneeId: 1, assigneeName: '张主管',
    status: 'approved', comment: null, actionAt: '2026-10-02 09:00:00', createdAt: '2026-10-02 08:00:00',
  };
  const consult: WorkflowTaskConsult = {
    id: 7, taskId: 101, instanceId: 9, nodeName: '合同审核', inviterId: 1, inviterName: '张主管',
    consulteeId: 5, consulteeName: '李预算', question: '请核对预算科目', opinion: '预算余额充足',
    status: 'replied', repliedAt: '2026-10-02 09:30:00', createdAt: '2026-10-02 09:00:00',
  };

  it('把协办挂到邀请任务所属审批组下并展示意见', () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} tasks={[task]} consults={[consult]} />);
    expect(screen.getByText('协办')).toBeInTheDocument();
    expect(screen.getByText('已回复')).toBeInTheDocument();
    expect(screen.getByText(/预算余额充足/)).toBeInTheDocument();
  });

  it('找不到归属节点的协办不展示', () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} tasks={[task]} consults={[{ ...consult, taskId: 999, nodeName: '不存在的节点' }]} />);
    expect(screen.queryByText('协办')).not.toBeInTheDocument();
  });
});

describe('slot times', () => {
  const approvedTask: WorkflowTask = {
    id: 101, instanceId: 9, nodeKey: 'review', nodeName: '合同审核', nodeType: 'approve',
    activationId: 'round-one', slotId: 11, taskKind: 'approval', waitReason: null,
    activatedAt: '2026-10-02 08:00:00', signPosition: null, assigneeId: 1, assigneeName: '张主管',
    status: 'approved', comment: null, actionAt: '2026-10-02 09:00:00', createdAt: '2026-10-02 08:00:00',
  };
  const pendingTask: WorkflowTask = {
    ...approvedTask, id: 102, slotId: 12, assigneeId: 2, assigneeName: '赵法务',
    status: 'pending', actionAt: null, activatedAt: '2026-10-02 08:30:00', createdAt: '2026-10-02 08:30:00',
  };

  it('已处理席位显示处理时间，未处理席位显示到达时间', () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} tasks={[approvedTask, pendingTask]} />);
    expect(screen.getByText('2026-10-02 09:00:00')).toBeInTheDocument();
    expect(screen.getByText('2026-10-02 08:30:00')).toBeInTheDocument();
  });

  it('无关联任务的席位不展示时间', () => {
    render(<WorkflowApprovalGroupsPanel activations={[activation]} tasks={[]} />);
    expect(screen.queryByText('2026-10-02 09:00:00')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-10-02 08:30:00')).not.toBeInTheDocument();
  });
});
