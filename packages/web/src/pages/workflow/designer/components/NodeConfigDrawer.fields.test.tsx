import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileWorkflowTree, flattenWorkflowValueFields, projectWorkflowGraph, type WorkflowFormField } from '@zenith/shared/workflow';
import { flattenAllFields } from '../form-tree';
import NodeConfigDrawer from './NodeConfigDrawer';

vi.mock('@/hooks/queries/workflow-designer', () => ({
  useWorkflowDesignerConnectorOptions: () => ({ data: [] }),
  useWorkflowDesignerDecisionRefOptions: () => ({ data: [] }),
}));

const fields: WorkflowFormField[] = [
  { key: 'layout', label: '分栏', type: 'row', columns: [{ span: 24, fields: [
    { key: 'category', label: '分栏内类别', type: 'select', options: ['A', 'B'] },
  ] }] },
  { key: 'items', label: '明细', type: 'detail', children: [
    { key: 'itemCategory', label: '明细列类别', type: 'select', options: ['A', 'B'] },
  ] },
];
const formFields = flattenWorkflowValueFields(fields);
const permissionFields = flattenAllFields(fields);

describe('node configuration field scopes', () => {
  it('opens a persisted trigger with its saved values and preserves them on confirmation', async () => {
    const config = { triggerType: 'webhook' as const, webhookUrl: 'http://localhost/saved', headers: { 'X-Test': 'saved' },
      bodyTemplate: '{"saved":true}', httpMethod: 'PUT' as const, timeoutMs: 5000, onFailure: 'block' as const };
    const result = projectWorkflowGraph({ nodes: [
      { id: 'start', position: { x: 0, y: 0 }, data: { key: 'start', type: 'start', label: '开始' } },
      { id: 'trigger', position: { x: 0, y: 0 }, data: { key: 'trigger', type: 'trigger', label: '触发器', triggerConfig: config } },
      { id: 'end', position: { x: 0, y: 0 }, data: { key: 'end', type: 'end', label: '结束' } },
    ], edges: [{ id: 'a', source: 'start', target: 'trigger' }, { id: 'b', source: 'trigger', target: 'end' }] });
    if (result.kind !== 'tree') throw new Error(result.reason);
    const trigger = result.process.initiator.children!;
    const onSave = vi.fn();
    render(<NodeConfigDrawer visible node={trigger} users={[]} roles={[]} formFields={[]} permissionFields={[]}
      onSave={onSave} onCancel={vi.fn()} />);
    expect(await screen.findByDisplayValue('http://localhost/saved')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('{"saved":true}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    trigger.props = onSave.mock.calls[0][1].props;
    expect(compileWorkflowTree(result.process).nodes.find(node => node.id === 'trigger')?.data.triggerConfig).toMatchObject(config);
  });

  it('lists layout children and detail columns in permissions and saves their edit setting', async () => {
    const onSave = vi.fn();
    render(<NodeConfigDrawer visible node={{ id: 'initiator', type: 'initiator', name: '发起人', props: {} }}
      users={[]} roles={[]} formFields={formFields} permissionFields={permissionFields} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: '表单权限' }));
    const nestedField = await screen.findByText('分栏内类别');
    expect(screen.getByText('分栏')).toBeInTheDocument();
    expect(screen.getByText('明细列类别')).toBeInTheDocument();
    const row = nestedField.closest('.fd-form-perm-row') as HTMLElement;
    fireEvent.click(within(row).getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith('initiator', expect.objectContaining({ props: expect.objectContaining({
      initiatorDesc: '', fieldPermissions: { category: 'edit' },
    }) }));
  });

  it('offers the nested layout value for routing without offering the detail column', async () => {
    render(<NodeConfigDrawer visible node={{ id: 'route', type: 'routeBranch', name: '路由分支', props: {} }}
      users={[]} roles={[]} formFields={formFields} permissionFields={permissionFields} onSave={vi.fn()} onCancel={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getAllByRole('combobox')[0]);
    expect(await screen.findByText('分栏内类别')).toBeInTheDocument();
    expect(screen.queryByText('明细列类别')).not.toBeInTheDocument();
    expect(screen.queryByText('分栏', { exact: true })).not.toBeInTheDocument();
  });
});
