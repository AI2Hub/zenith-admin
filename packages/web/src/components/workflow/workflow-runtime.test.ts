/**
 * 任务状态展示口径单测：抄送任务送达即完成，引擎以 skipped 落库，
 * 展示层必须显示「已抄送」而不是「已跳过」（后者会被读成任务作废）。
 */
import { describe, expect, it } from 'vitest';
import type { WorkflowTask, WorkflowTaskConsult } from '@zenith/shared/workflow';
import { buildNodeRuntimeMap, taskStatusDisplay } from './workflow-runtime';

function task(overrides: Partial<WorkflowTask> & Pick<WorkflowTask, 'id' | 'nodeKey'>): WorkflowTask {
  return {
    instanceId: 1, nodeName: '直属主管审批', nodeType: 'approve', activationId: 'a1', slotId: 1,
    taskKind: 'approval', waitReason: null, activatedAt: null, signPosition: null,
    assigneeId: 4, assigneeName: '李四', status: 'approved', comment: null, actionAt: null,
    createdAt: '2026-10-11 20:15:56',
    ...overrides,
  };
}

function consult(overrides: Partial<WorkflowTaskConsult> & Pick<WorkflowTaskConsult, 'id' | 'taskId'>): WorkflowTaskConsult {
  return {
    instanceId: 1, nodeName: '直属主管审批', inviterId: 4, inviterName: '李四',
    consulteeId: 5, consulteeName: '王五', question: null, opinion: null,
    status: 'pending', repliedAt: null, createdAt: '2026-10-11 20:20:00',
    ...overrides,
  };
}

describe('buildNodeRuntimeMap', () => {
  it('把协办按邀请任务归到所属节点，不改变节点状态', () => {
    const map = buildNodeRuntimeMap(
      [task({ id: 25, nodeKey: 'approve_manager' }), task({ id: 26, nodeKey: 'approve_finance', nodeName: '财务复核', assigneeName: '王五' })],
      [consult({ id: 2, taskId: 25, status: 'replied', opinion: '建议同意', repliedAt: '2026-10-11 20:25:00' })],
    );

    expect(map.get('approve_manager')?.status).toBe('approved');
    expect(map.get('approve_manager')?.consults).toEqual([
      { consulteeName: '王五', avatar: null, status: 'replied', question: null, opinion: '建议同意', repliedAt: '2026-10-11 20:25:00' },
    ]);
    expect(map.get('approve_finance')?.consults).toBeUndefined();
  });

  it('没有对应任务的协办不凭空造节点，未填姓名时回退到 #ID', () => {
    const map = buildNodeRuntimeMap(
      [task({ id: 25, nodeKey: 'approve_manager' })],
      [consult({ id: 3, taskId: 999 }), consult({ id: 4, taskId: 25, consulteeName: null })],
    );

    expect(map.size).toBe(1);
    expect(map.get('approve_manager')?.consults).toHaveLength(1);
    expect(map.get('approve_manager')?.consults?.[0].consulteeName).toBe('用户#5');
  });
});

describe('taskStatusDisplay', () => {
  it('抄送任务显示已抄送', () => {
    expect(taskStatusDisplay({ status: 'skipped', nodeType: 'ccNode' })).toEqual({ text: '已抄送', color: 'green' });
    expect(taskStatusDisplay({ status: 'approved', nodeType: 'ccNode' })).toEqual({ text: '已抄送', color: 'green' });
  });

  it('非抄送任务保持原有状态文案', () => {
    expect(taskStatusDisplay({ status: 'skipped', nodeType: 'approve' }).text).toBe('已跳过');
    expect(taskStatusDisplay({ status: 'pending', nodeType: 'approve' }).text).toBe('待审批');
    expect(taskStatusDisplay({ status: 'waiting', nodeType: 'handler' }).text).toBe('等待中');
  });

  it('未知状态回退为原始值且不抛错', () => {
    expect(taskStatusDisplay({ status: 'unknown', nodeType: null })).toEqual({ text: 'unknown', color: 'grey' });
    expect(taskStatusDisplay({}).text).toBe('');
  });
});
