import { describe, expect, it, vi } from 'vitest';
import type { WorkflowFlowData, WorkflowNodeConfig } from '@zenith/shared/workflow';
import type { DbExecutor } from '../../../db/types';
import { workflowInstances, workflowNodeActivations, workflowTasks } from '../../../db/schema';

const state = vi.hoisted(() => ({ users: [1] }));
vi.mock('../workflow-assignee-resolver.service', () => ({
  createDeptTree: () => ({}), resolveAssigneeIds: async () => state.users, resolveAdminUserId: async () => 1,
}));
vi.mock('../workflow-delegations.service', () => ({ resolveActiveDelegate: async () => null }));
vi.mock('./assignees', () => ({ applyAssigneeRuntimeStrategies: async () => ({ ids: state.users, excluded: [] }) }));
vi.mock('./async-jobs', () => ({ armTaskAsyncJobs: async () => undefined }));
import { advanceAndMaterialize } from './materialize';

describe('materialized approval method', () => {
  it.each([
    ['or', 1, 1], ['and', 1, 1], ['sequential', 1, 1], ['ratio', 1, 1],
    ['or', 2, 1], ['and', 2, 2], ['sequential', 2, 2], ['ratio', 2, 2],
  ] as const)('keeps %s with %i assignees and %i required votes', async (method, count, required) => {
    state.users = Array.from({ length: count }, (_, i) => i + 1);
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    let id = 0;
    const exec = {
      select: () => ({ from: (table: unknown) => {
        const result = table === workflowInstances ? [{ definitionId: 8 }] : [];
        return { where: () => Object.assign(Promise.resolve(result), { orderBy: async () => result, limit: async () => result }) };
      } }),
      insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => {
        inserted.push({ table, values });
        return { returning: async () => [{ ...values, id: ++id }] };
      } }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    } as unknown as DbExecutor;
    const configs: WorkflowNodeConfig[] = [
      { key: 'start', type: 'start', label: '开始' },
      { key: 'approval', type: 'approve', label: '审批', assigneeType: 'user', assigneeIds: state.users, approveMethod: method, approveRatio: 75 },
      { key: 'end', type: 'end', label: '结束' },
    ];
    const flowData: WorkflowFlowData = {
      nodes: configs.map(data => ({ id: data.key, position: { x: 0, y: 0 }, data })),
      edges: [{ id: 'a', source: 'start', target: 'approval' }, { id: 'b', source: 'approval', target: 'end' }],
    };
    await advanceAndMaterialize({ kind: 'seed' }, { executor: exec, instanceId: 1, initiatorId: 1, flowData, formData: {} });
    const activation = inserted.find(row => row.table === workflowNodeActivations)?.values;
    expect(activation).toMatchObject({ approveMethod: method, approveRatio: method === 'ratio' ? 75 : null, baseTotal: count, baseRequired: required });
    const tasks = inserted.filter(row => row.table === workflowTasks).map(row => row.values);
    expect(tasks).toHaveLength(count);
    expect(tasks.map(task => task.status)).toEqual(method === 'sequential' && count > 1 ? ['pending', 'waiting'] : Array(count).fill('pending'));
  });
});
