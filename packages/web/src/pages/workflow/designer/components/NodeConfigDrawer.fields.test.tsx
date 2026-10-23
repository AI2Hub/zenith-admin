import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flattenWorkflowValueFields, type WorkflowFormField } from '@zenith/shared/workflow';
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
