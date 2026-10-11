import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkflowFlowData, WorkflowTask, WorkflowTaskConsult } from '@zenith/shared/workflow';
import WorkflowGraphView from './WorkflowGraphView';

const flowData: WorkflowFlowData = {
  nodes: [
    { id: 'node-start', position: { x: 0, y: 0 }, data: { key: 'start', type: 'start', label: '开始' } },
    { id: 'node-manager', position: { x: 0, y: 0 }, data: { key: 'approve_manager', type: 'approve', label: '直属主管审批' } },
    { id: 'node-end', position: { x: 0, y: 0 }, data: { key: 'end', type: 'end', label: '结束' } },
  ],
  edges: [
    { id: 'e1', source: 'node-start', target: 'node-manager' },
    { id: 'e2', source: 'node-manager', target: 'node-end' },
  ],
};

const task: WorkflowTask = {
  id: 25, instanceId: 10, nodeKey: 'approve_manager', nodeName: '直属主管审批', nodeType: 'approve',
  activationId: 'a1', slotId: 1, taskKind: 'approval', waitReason: null,
  activatedAt: '2026-10-11 20:15:56', signPosition: null, assigneeId: 4, assigneeName: '李四',
  status: 'approved', comment: '同意采购', actionAt: '2026-10-11 20:35:37', createdAt: '2026-10-11 20:15:56',
};

const consult: WorkflowTaskConsult = {
  id: 2, taskId: 25, instanceId: 10, nodeName: '直属主管审批', inviterId: 4, inviterName: '李四',
  consulteeId: 5, consulteeName: '王五', question: '请给专业意见', opinion: '建议同意',
  status: 'replied', repliedAt: '2026-10-11 20:30:00', createdAt: '2026-10-11 20:20:00',
};

describe('WorkflowGraphView consult overlay', () => {
  it('在邀请任务所属节点卡片上展示协办徽标', () => {
    render(<WorkflowGraphView flowData={flowData} tasks={[task]} consults={[consult]} instanceStatus="approved" />);
    expect(screen.getByText('王五')).toBeInTheDocument();
    expect(screen.getByText('已回复')).toBeInTheDocument();
  });

  it('无协办时不展示协办徽标', () => {
    render(<WorkflowGraphView flowData={flowData} tasks={[task]} consults={[]} instanceStatus="approved" />);
    expect(screen.queryByText('已回复')).not.toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
  });

  it('协办收进审批人之外的独立分组，并按回复状态区分', () => {
    const pending: WorkflowTaskConsult = {
      ...consult, id: 3, consulteeId: 6, consulteeName: '赵六', question: '请确认供应商资质', opinion: null, status: 'pending', repliedAt: null,
    };
    const { container } = render(<WorkflowGraphView flowData={flowData} tasks={[task]} consults={[consult, pending]} instanceStatus="approved" />);
    const group = container.querySelector<HTMLElement>('.fd-node-card__rt-consults');
    expect(group).not.toBeNull();
    const consults = within(group!);
    expect(consults.queryByText('李四')).not.toBeInTheDocument();
    expect(consults.getAllByText('协办')).toHaveLength(2);
    expect(consults.getByText('已回复')).toHaveClass('fd-node-card__rt-consult-status--replied');
    expect(consults.getByText('待回复')).toHaveClass('fd-node-card__rt-consult-status--pending');
    expect(consults.getByText('请确认供应商资质')).toBeInTheDocument();
  });
});
